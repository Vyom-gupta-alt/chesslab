import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { IB_COMMAND_TERMS } from "@/types/syllabus";
import type { DraftSyllabus } from "./draft";
import { fileToBase64, prepareImageForApi, sourceKind } from "./files";

export const AI_MODEL = "claude-opus-5-5";

/** What Claude must return. Converted to a strict Syllabus by draftToSyllabus(). */
const ExtractionSchema = z.object({
  programme: z.enum(["DP", "MYP"]),
  subject: z.string(),
  level: z.string().nullable().describe("DP: SL, HL or SL/HL. MYP: Standard, Extended or Standard/Extended"),
  firstAssessment: z.string().nullable(),
  topics: z.array(
    z.object({
      code: z.string().describe('Syllabus number, e.g. "1"'),
      title: z.string(),
      teachingHours: z.number().nullable(),
      subtopics: z.array(
        z.object({
          code: z.string().describe('e.g. "1.2"'),
          title: z.string(),
          outcomes: z.array(
            z.object({
              text: z.string(),
              commandTerms: z.array(z.string()),
              level: z.string().nullable().describe("DP: SL, HL or AHL. MYP: Standard or Extended"),
            }),
          ),
        }),
      ),
    }),
  ),
  assessmentObjectives: z.array(z.object({ code: z.string(), description: z.string() })),
  criteria: z.array(
    z.object({ code: z.string(), title: z.string(), maxMarks: z.number(), strands: z.array(z.string()) }),
  ),
  keyConcepts: z.array(z.string()),
  relatedConcepts: z.array(z.string()),
  globalContexts: z.array(z.string()),
});

const SYSTEM = `You extract the structure of an International Baccalaureate (IB) syllabus from the material a student or teacher provides: subject guide PDFs, screenshots, phone photos of pages, or pasted text. The output becomes the topic tree of a practice and assessment app, so keep the guide's own numbering and wording.

- programme: "MYP" for Middle Years Programme material (criteria A–D marked out of 8, key/related concepts, global contexts, standard/extended mathematics); otherwise "DP".
- topics → subtopics → learning outcomes, following the guide's numbering (topic "1", subtopic "1.2"). If a subtopic has no number, number it within its topic. Keep each outcome as a short line close to the guide's text; do not merge unrelated content.
- commandTerms: for each outcome, the IB command terms it calls for, chosen only from this list: ${IB_COMMAND_TERMS.join(", ")}. Use the verbs in the outcome where they match; otherwise pick the terms an IB examiner would most likely use for it.
- level: DP outcomes SL, HL or AHL (AHL = additional higher level content); MYP mathematics Standard or Extended.
- Include assessment objectives (e.g. AO1), assessment criteria with their maximum marks and strands, and for MYP the key concepts, related concepts and global contexts when they appear. Use empty arrays when they don't.
- The material may be partial (a single screenshot). Extract only what is shown; never invent topics that aren't in the material.`;

export interface AiInput {
  files: File[];
  text: string;
}

export class AiExtractError extends Error {}

export async function extractWithClaude(
  apiKey: string,
  input: AiInput,
  onProgress?: (label: string) => void,
): Promise<DraftSyllabus> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });

  onProgress?.("Preparing files…");
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of input.files) {
    const kind = sourceKind(f);
    if (kind === "image") {
      const img = await prepareImageForApi(f);
      content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
    } else if (kind === "pdf") {
      content.push({
        type: "document",
        title: f.name,
        source: { type: "base64", media_type: "application/pdf", data: await fileToBase64(f) },
      });
    } else if (kind === "text") {
      content.push({ type: "text", text: `File ${f.name}:\n${await f.text()}` });
    }
  }
  if (input.text.trim()) content.push({ type: "text", text: `Pasted syllabus text:\n${input.text.trim()}` });
  if (!content.length) throw new AiExtractError("Add a screenshot, PDF or some text first.");
  content.push({ type: "text", text: "Extract the syllabus structure from the material above." });

  onProgress?.("Claude is reading your syllabus…");
  try {
    const stream = client.beta.messages.stream({
      model: AI_MODEL,
      max_tokens: 64000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
      // If a safety classifier declines, the API retries on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    let chars = 0;
    stream.on("text", (delta) => {
      chars += delta.length;
      onProgress?.(`Claude is building your topic tree… (${Math.round(chars / 100) / 10}k characters)`);
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") throw new AiExtractError("Claude declined to process this material.");
    if (message.stop_reason === "max_tokens")
      throw new AiExtractError("The syllabus is too long to extract in one go. Upload it in smaller parts (e.g. one topic at a time).");
    const parsed = message.parsed_output;
    if (!parsed) throw new AiExtractError("Claude's answer couldn't be read. Please try again.");
    return parsed;
  } catch (e) {
    if (e instanceof AiExtractError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiExtractError("That API key was rejected. Check it and try again.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiExtractError("This API key doesn't have access to the model.");
    if (e instanceof Anthropic.RateLimitError) throw new AiExtractError("Rate limit reached. Wait a minute and try again.");
    if (e instanceof Anthropic.BadRequestError) throw new AiExtractError(`The request was rejected: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new AiExtractError("Couldn't reach the Claude API. Check your connection.");
    if (e instanceof Anthropic.APIError) throw new AiExtractError(`Claude API error (${e.status ?? "unknown"}): ${e.message}`);
    throw e;
  }
}
