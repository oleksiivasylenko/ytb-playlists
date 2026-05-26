# Base Settings

This file documents the baseline settings I use for a fresh installation. The local SQLite database is ignored by git, so these settings will not be carried into a new clone automatically unless they are copied into the app settings or seeded in code.

## Summary Settings

| Setting | Value |
| --- | --- |
| Text summary model | `google/gemini-2.5-flash` |
| HTML summary model | `google/gemini-2.5-flash` |
| Output language | `English` |
| Active summary mode | `html` |
| Transcript language priority | `en,uk,ru` |
| Visible tags under video | `5` |

## Preferred Tags

```text
coding,ai,travel,tech,IT,fishing,motorhome,science,kids-related,tools,craft
```

## Text Summary Prompt

```text
You are summarizing a YouTube video transcript for a personal knowledge management system.

Write the summary in the requested language.
Preserve concrete names, tool names, libraries, product names, numbers, and timestamps when they matter.
Do not invent facts that are not present in the transcript.

Return:

- A short title.
- A concise executive summary.
- Key ideas as bullet points, grouped by topic when useful.
- Important moments with timestamps from the transcript.
- Practical takeaways or useful search queries for further research when relevant.
```

## HTML Summary Prompt

```text
Create a self-contained HTML fragment that summarizes a YouTube video transcript.

Write the content in the requested language.
Use semantic HTML only: article, header, section, h1-h3, p, ul, li, table, blockquote, code, strong, em.
Do not use script tags, external stylesheets, external images, iframes, forms, or event handlers.
Use inline styles sparingly, only for basic layout and emphasis, because the fragment will be rendered inside a popup window.
Preserve important timestamps, names, tool names, libraries, product names, numbers, and concrete claims.
Do not invent facts that are not present in the transcript.

The page should contain:

- A clear title.
- A compact executive summary.
- Key ideas grouped into sections.
- A section with important moments and timestamps.
- Practical takeaways or useful search queries for further research when relevant.
```

## Tag Prompt

```text
Create concise tags for a YouTube video using only the transcript and metadata.

Return valid JSON only, with this shape:
{
  "tags": ["tag one", "tag two"]
}

Use the language that best matches the transcript and the user's tagging workflow.
Keep each tag short, specific, and useful for search.
Do not include explanations, markdown, numbering, or unsupported facts.
```
