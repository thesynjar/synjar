import {
  Controller,
  Get,
  Param,
  Res,
  Header,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { InstructionSetService } from '@/application/instruction-set/instruction-set.service';
import { PublicSetContentResponseDto } from '../dto/instruction-set.dto';

@ApiTags('Public Instruction Sets')
@Controller('s')
export class PublicInstructionSetController {
  constructor(private readonly instructionSetService: InstructionSetService) {}

  @Get(':id')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 req/min for raw content
  @ApiOperation({
    summary: 'Get instruction set content as plain text',
    description: 'Returns plain text/markdown content - primary endpoint for LLM agents',
  })
  @ApiResponse({ status: 200, description: 'Plain text content' })
  @ApiResponse({ status: 404, description: 'Instruction set not found' })
  @Header('Access-Control-Allow-Origin', '*') // Allow CORS for LLM agents
  async getMarkdownContent(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      const content = await this.instructionSetService.getRawContent(id);

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(content);
    } catch (error) {
      if (error instanceof NotFoundException) {
        res.status(404).send('Instruction set not found');
        return;
      }
      throw error;
    }
  }

  @Get(':id/html')
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 req/min for HTML view
  @ApiOperation({
    summary: 'Get public instruction set HTML view',
    description: 'Returns HTML page with copy button for human users',
  })
  @ApiResponse({ status: 200, description: 'HTML page' })
  @ApiResponse({ status: 404, description: 'Instruction set not found' })
  @Header('X-Frame-Options', 'DENY')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'")
  async getHtmlView(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      const content = await this.instructionSetService.getPublicContent(id);

      // Generate simple HTML page
      const html = this.generateHtmlPage(content);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      if (error instanceof NotFoundException) {
        res.status(404).send(this.generate404Page());
        return;
      }
      throw error;
    }
  }

  @Get(':id/content')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 req/min for JSON API
  @ApiOperation({
    summary: 'Get instruction set content as JSON',
    description: 'Returns JSON with metadata and document content',
  })
  @ApiResponse({ status: 200, type: PublicSetContentResponseDto })
  @ApiResponse({ status: 404, description: 'Instruction set not found' })
  @Header('Access-Control-Allow-Origin', '*') // Allow CORS for LLM agents
  async getJsonContent(@Param('id') id: string) {
    return this.instructionSetService.getPublicContent(id);
  }

  private generateHtmlPage(content: {
    id: string;
    name: string;
    description: string | null;
    documents: Array<{ title: string; content: string; sourceUrl: string | null; order: number }>;
    content: string;
    totalSizeBytes: number;
    tokenEstimate: number;
    updatedAt: Date;
  }): string {
    const escapedName = this.escapeHtml(content.name);
    const escapedDescription = content.description ? this.escapeHtml(content.description) : '';
    const escapedContent = this.escapeHtml(content.content);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${escapedName} - Synjar</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
      color: #333;
    }
    h1 { margin-bottom: 0.5rem; }
    .description { color: #666; margin-bottom: 1.5rem; }
    .meta { color: #888; font-size: 0.9rem; margin-bottom: 1rem; }
    .copy-btn {
      background: #2563eb;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 2rem;
    }
    .copy-btn:hover { background: #1d4ed8; }
    .copy-btn:focus { outline: 2px solid #3b82f6; outline-offset: 2px; }
    .copy-btn.copied { background: #16a34a; }
    .content {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      white-space: pre-wrap;
      font-family: 'Menlo', 'Monaco', monospace;
      font-size: 0.9rem;
      overflow-x: auto;
    }
    .documents-list {
      margin-bottom: 1.5rem;
    }
    .document-item {
      padding: 0.5rem 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .document-item:last-child { border-bottom: none; }
    .source-link { color: #2563eb; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>${escapedName}</h1>
  ${escapedDescription ? `<p class="description">${escapedDescription}</p>` : ''}
  <p class="meta">
    ${content.documents.length} documents ·
    ~${content.tokenEstimate.toLocaleString()} tokens ·
    Updated ${new Date(content.updatedAt).toLocaleDateString()}
  </p>

  <button class="copy-btn" onclick="copyContent()" aria-live="polite">
    Copy entire context
  </button>

  <h2>Documents</h2>
  <div class="documents-list">
    ${content.documents.map(doc => `
      <div class="document-item">
        <strong>${this.escapeHtml(doc.title)}</strong>
        ${doc.sourceUrl ? `<br><a href="${this.escapeHtml(doc.sourceUrl)}" class="source-link" target="_blank" rel="noopener">View source</a>` : ''}
      </div>
    `).join('')}
  </div>

  <h2>Full Content</h2>
  <pre class="content" id="content">${escapedContent}</pre>

  <script>
    function copyContent() {
      const content = document.getElementById('content').textContent;
      navigator.clipboard.writeText(content).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy entire context';
          btn.classList.remove('copied');
        }, 2000);
      });
    }
  </script>
</body>
</html>`;
  }

  private generate404Page(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Not Found - Synjar</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      text-align: center;
      color: #333;
    }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    p { color: #666; }
  </style>
</head>
<body>
  <div>
    <h1>Instruction Set Not Found</h1>
    <p>This instruction set doesn't exist or is not publicly available.</p>
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
