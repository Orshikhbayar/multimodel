"use client";

import { ContentColumn, PageHeader } from "@/components/layout";
import { MessageItem } from "@/components/chat";
import type { Message } from "@/lib/types";

// Generate a very long message for testing
function generateLongText(chars: number): string {
    const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ";
    let result = "";
    while (result.length < chars) {
        result += lorem;
    }
    return result.substring(0, chars);
}

// Test fixtures
const fixtures = {
    shortMessage: {
        id: "short-1",
        role: "user" as const,
        content: "Hello, how are you?",
        createdAt: Date.now(),
    },
    mediumMessage: {
        id: "medium-1",
        role: "assistant" as const,
        content: "I'm doing great! How can I help you today? I'm capable of helping with many tasks including coding, writing, analysis, and more.",
        createdAt: Date.now(),
        runs: [{
            id: "run-medium-1",
            model: "GPT-4.1",
            status: "done" as const,
            text: "I'm doing great! How can I help you today? I'm capable of helping with many tasks including coding, writing, analysis, and more.",
        }],
    },
    longMessage: {
        id: "long-1",
        role: "assistant" as const,
        content: "",
        createdAt: Date.now(),
        runs: [{
            id: "run-long-1",
            model: "Claude 3.5",
            status: "done" as const,
            text: generateLongText(2000),
        }],
    },
    veryLongMessage: {
        id: "verylong-1",
        role: "assistant" as const,
        content: "",
        createdAt: Date.now(),
        runs: [{
            id: "run-verylong-1",
            model: "GPT-4.1",
            status: "done" as const,
            text: generateLongText(5000),
        }],
    },
    codeMessage: {
        id: "code-1",
        role: "assistant" as const,
        content: "",
        createdAt: Date.now(),
        runs: [{
            id: "run-code-1",
            model: "Claude 3.5",
            status: "done" as const,
            text: `Here's a TypeScript example:

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users');
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }
  return response.json();
}

// Usage
const users = await fetchUsers();
console.log(users);
\`\`\`

This demonstrates a simple async function with TypeScript types.`,
        }],
    },
    longUrlMessage: {
        id: "url-1",
        role: "assistant" as const,
        content: "",
        createdAt: Date.now(),
        runs: [{
            id: "run-url-1",
            model: "GPT-4.1",
            status: "done" as const,
            text: `Here's a really long URL that should wrap properly:

https://example.com/very/long/path/that/goes/on/and/on/with/many/segments/and/query/parameters?param1=value1&param2=value2&param3=value3&param4=value4&param5=value5&param6=value6&param7=value7&param8=value8&tracking_id=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz

And here's another one without spaces around it:

Check this link: https://subdomain.domain.example.org/api/v2/resources/documents/12345678-abcd-efgh-ijkl-mnopqrstuvwx/versions/latest/content?format=json&include_metadata=true&access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9

The URLs above should wrap to the next line without breaking the layout.`,
        }],
    },
    markdownMessage: {
        id: "markdown-1",
        role: "assistant" as const,
        content: "",
        createdAt: Date.now(),
        runs: [{
            id: "run-md-1",
            model: "GPT-4.1",
            status: "done" as const,
            text: `# Heading 1

## Heading 2

### Heading 3

Here's some **bold text** and *italic text* and ***bold italic***.

- Bullet point 1
- Bullet point 2
  - Nested bullet
  - Another nested

1. Numbered item
2. Another numbered
3. Third item

> This is a blockquote
> It can span multiple lines

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Row 1    | Data     | More     |
| Row 2    | Data     | More     |

Inline \`code\` looks like this.

[Link text](https://example.com)

---

That's a horizontal rule above.`,
        }],
    },
    errorMessage: {
        id: "error-1",
        role: "assistant" as const,
        content: "",
        createdAt: Date.now(),
        runs: [{
            id: "run-error-1",
            model: "GPT-4.1",
            status: "error" as const,
            text: "An error occurred while processing your request.",
        }],
    },
    manyLinesMessage: {
        id: "lines-1",
        role: "assistant" as const,
        content: "",
        createdAt: Date.now(),
        runs: [{
            id: "run-lines-1",
            model: "Claude 3.5",
            status: "done" as const,
            text: Array.from({ length: 50 }, (_, i) => `Line ${i + 1}: This is a sample line of text.`).join("\n"),
        }],
    },
} satisfies Record<string, Message>;

export default function FixturesPage() {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
            <ContentColumn className="space-y-8">
                <PageHeader
                    label="Development"
                    title="Message Fixtures"
                    description="Test cases for message rendering edge cases"
                />

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Short User Message</h2>
                    <MessageItem message={fixtures.shortMessage} />
                </div>

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Medium Assistant Message</h2>
                    <MessageItem
                        message={fixtures.mediumMessage}
                        run={fixtures.mediumMessage.runs[0]}
                    />
                </div>

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Long Message (~2000 chars)</h2>
                    <MessageItem
                        message={fixtures.longMessage}
                        run={fixtures.longMessage.runs[0]}
                    />
                </div>

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Very Long Message (~5000 chars)</h2>
                    <MessageItem
                        message={fixtures.veryLongMessage}
                        run={fixtures.veryLongMessage.runs[0]}
                    />
                </div>

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Code Block</h2>
                    <MessageItem
                        message={fixtures.codeMessage}
                        run={fixtures.codeMessage.runs[0]}
                    />
                </div>

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Long URLs</h2>
                    <MessageItem
                        message={fixtures.longUrlMessage}
                        run={fixtures.longUrlMessage.runs[0]}
                    />
                </div>

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Markdown Formatting</h2>
                    <MessageItem
                        message={fixtures.markdownMessage}
                        run={fixtures.markdownMessage.runs[0]}
                    />
                </div>

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Error State</h2>
                    <MessageItem
                        message={fixtures.errorMessage}
                        run={fixtures.errorMessage.runs[0]}
                    />
                </div>

                <div className="space-y-6 rounded-2xl bg-[hsl(var(--app-panel))] p-6 shadow-inner">
                    <h2 className="text-lg font-semibold">Many Lines (50 lines)</h2>
                    <MessageItem
                        message={fixtures.manyLinesMessage}
                        run={fixtures.manyLinesMessage.runs[0]}
                    />
                </div>
            </ContentColumn>
        </div>
    );
}
