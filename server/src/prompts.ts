export const defaultPlainSummaryPrompt = `You are summarizing a YouTube video transcript for a personal knowledge workflow.

Write the summary in the requested language.
Preserve concrete names, tools, libraries, product names, numbers, and timestamps when they matter.
Do not invent facts that are not supported by the transcript.

Return:
1. A concise title.
2. A short executive summary.
3. Key points as bullets, grouped by topic when useful.
4. Important timestamped moments using the transcript timestamps.
5. Actionable takeaways or follow-up search terms when relevant.`;

export const defaultHtmlSummaryPrompt = `Create a self-contained HTML fragment that summarizes a YouTube video transcript.

Write the content in the requested language.
Use semantic HTML only: article, header, section, h1-h3, p, ul, li, table, blockquote, code, strong, em.
Do not include script tags, external stylesheets, external images, iframes, forms, or event handlers.
Use inline style attributes sparingly for layout and emphasis, because the fragment will be rendered inside a popup.
Preserve important timestamps, names, tools, libraries, product names, numbers, and concrete claims.
Do not invent facts that are not supported by the transcript.

The page should include:
1. A clear title.
2. A compact executive summary.
3. Key ideas grouped into sections.
4. A timestamped highlights section.
5. Actionable takeaways or follow-up search terms when relevant.`;

export const defaultTagPrompt = `Create concise tags for a YouTube video using only the transcript and metadata.

Return valid JSON only, with this shape:
{
  "tags": ["tag one", "tag two"]
}

Use the language that best matches the transcript and the user's tagging workflow.
Keep each tag short, specific, and useful for search.
Do not include explanations, markdown, numbering, or unsupported facts.`;

export const defaultAskPrompt = `Answer questions about a YouTube video using only the provided transcript and currently loaded comments.

Write in the same language as the user's question unless they ask otherwise.
Be explicit about whether evidence came from the video transcript, the comments, or both.
If the provided comments are incomplete or empty, say that clearly.
Do not invent facts or claim that a topic was mentioned unless it appears in the provided context.
When useful, quote short comment snippets and mention commenter names.`;
