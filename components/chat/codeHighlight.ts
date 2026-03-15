import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import html from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("html", html);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);

export const SUPPORTED_LANGUAGES = new Set([
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "python",
  "sql",
  "tsx",
  "typescript",
  "yaml",
]);

const LANGUAGE_ALIASES = new Map([
  ["js", "javascript"],
  ["ts", "typescript"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["yml", "yaml"],
  ["md", "markdown"],
]);

export const normalizeLanguage = (language?: string) => {
  if (!language) return "text";
  const normalized = language.trim().toLowerCase();
  return LANGUAGE_ALIASES.get(normalized) ?? normalized;
};

export { SyntaxHighlighter as PrismLight };
