# Synjar Integration Guide

## Overview

Synjar provides multiple integration options for connecting AI tools to your knowledge base.

## Integration Methods

### 1. REST API (Recommended)

Full-featured API for complete control over your knowledge base.

**Best for:**
- Custom applications
- Backend services
- Complex workflows

**Example: Search from Node.js**

```javascript
const response = await fetch('http://localhost:6200/api/v1/workspaces/ws_123/search', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'How do I reset my password?',
    limit: 5,
  }),
});

const { results } = await response.json();
```

### 2. Public Links

Token-based access for external integrations without exposing credentials.

**Best for:**
- Chatbots
- Customer support widgets
- Third-party AI tools

**Example: Create Public Link**

```bash
curl -X POST http://localhost:6200/api/v1/workspaces/ws_123/public-links \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Chatbot",
    "allowedTags": ["faq", "troubleshooting"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }'
```

**Example: Query via Public Link**

```javascript
// No authentication required
const response = await fetch('http://localhost:6200/api/v1/public/abc123xyz/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'What are your business hours?',
  }),
});
```

### 3. LangChain Integration

Use Synjar as a retriever in LangChain applications.

```python
from langchain.retrievers import RESTRetriever

retriever = RESTRetriever(
    url="http://localhost:6200/api/v1/public/{token}/search",
    headers={"Content-Type": "application/json"},
    body_template={"query": "{query}", "limit": 5}
)

docs = retriever.get_relevant_documents("How do I integrate with Slack?")
```

### 4. OpenAI Function Calling

Define Synjar as a function for GPT models.

```javascript
const functions = [{
  name: 'search_knowledge_base',
  description: 'Search the company knowledge base for relevant information',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags',
      },
    },
    required: ['query'],
  },
}];

// When function is called:
async function searchKnowledgeBase({ query, tags }) {
  const response = await fetch('http://localhost:6200/api/v1/public/{token}/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, tags }),
  });
  return response.json();
}
```

## Use Case Examples

### Customer Support Bot

```javascript
async function handleCustomerQuery(userMessage) {
  // Search knowledge base
  const results = await searchSynjar(userMessage);

  // Build context from results
  const context = results.map(r => r.content).join('\n\n');

  // Generate response with LLM
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: `Answer based on this knowledge:\n${context}` },
      { role: 'user', content: userMessage },
    ],
  });

  return response.choices[0].message.content;
}
```

### Documentation Assistant

```javascript
async function answerDocQuestion(question) {
  const results = await fetch(`${SYNJAR_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: question,
      tags: ['api', 'documentation'],
      limit: 3,
    }),
  }).then(r => r.json());

  if (results.length === 0) {
    return "I couldn't find relevant documentation. Please try rephrasing your question.";
  }

  return formatAnswer(results);
}
```

### Slack Bot Integration

```javascript
app.event('message', async ({ event, say }) => {
  if (event.text.startsWith('!ask ')) {
    const query = event.text.slice(5);

    const results = await searchSynjar(query);

    if (results.length > 0) {
      await say({
        text: results[0].content,
        blocks: formatSlackBlocks(results),
      });
    } else {
      await say("I couldn't find an answer to that question.");
    }
  }
});
```

## Best Practices

1. **Cache common queries** - Reduce API calls for frequently asked questions
2. **Use tag filtering** - Narrow results to relevant categories
3. **Handle empty results** - Provide fallback responses
4. **Monitor usage** - Track which queries succeed/fail
5. **Set appropriate limits** - Don't retrieve more results than needed

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Authenticated API | 100 req/min |
| Public Links | 30 req/min per token |

Adjust via environment variables for self-hosted installations.
