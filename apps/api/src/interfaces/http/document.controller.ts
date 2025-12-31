import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/application/auth/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserData,
} from '@/application/auth/current-user.decorator';
import { DocumentService } from '@/application/document/document.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  ListDocumentsQueryDto,
  DocumentResponseDto,
  DocumentListResponseDto,
  LockResponseDto,
  LockErrorResponseDto,
  SaveDraftDto,
  PublishDocumentDto,
  DiscardDraftDto,
  SaveDraftResponseDto,
  PublishDocumentResponseDto,
  DiscardDraftResponseDto,
  ConflictErrorResponseDto,
} from '../dto/document.dto';

// Hard ceiling for multipart - actual limit is enforced by WorkspaceLimitsService from env
const UPLOAD_CEILING = 100 * 1024 * 1024; // 100MB absolute max

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create document (text or file upload)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        sourceDescription: { type: 'string' },
        verificationStatus: { type: 'string', enum: ['VERIFIED', 'UNVERIFIED'] },
        tags: { type: 'array', items: { type: 'string' } },
        file: { type: 'string', format: 'binary' },
      },
      required: ['title'],
    },
  })
  @ApiResponse({ status: 201, type: DocumentResponseDto })
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateDocumentDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: UPLOAD_CEILING }),
          new FileTypeValidator({
            fileType: /(application\/pdf|application\/vnd.openxmlformats-officedocument.wordprocessingml.document|text\/plain|text\/markdown)/,
          }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.documentService.create(workspaceId, user.id, dto, file);
  }

  @Get()
  @ApiOperation({ summary: 'List documents' })
  @ApiResponse({ status: 200, type: DocumentListResponseDto })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documentService.findAll(workspaceId, user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiResponse({ status: 200, type: DocumentResponseDto })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentService.findOne(workspaceId, id, user.id);
  }

  @Put(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min - prevents excessive re-indexing
  @ApiOperation({ summary: 'Update document' })
  @ApiResponse({ status: 200, type: DocumentResponseDto })
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentService.update(workspaceId, id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete document' })
  @ApiResponse({ status: 204 })
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.documentService.delete(workspaceId, id, user.id);
  }

  // ============ SPEC-018: Partial Update (Auto-save) ============

  @Patch(':id')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 req/min for auto-save
  @ApiOperation({ summary: 'Partial update document (for auto-save)' })
  @ApiResponse({ status: 200, type: DocumentResponseDto })
  @ApiResponse({ status: 409, description: 'Conflict - document was modified by another user' })
  async partialUpdate(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentService.update(workspaceId, id, user.id, dto);
  }

  // ============ SPEC-018: Edit Lock Endpoints ============

  @Post(':id/lock')
  @ApiOperation({ summary: 'Acquire edit lock on document' })
  @ApiResponse({ status: 200, type: LockResponseDto })
  @ApiResponse({ status: 409, type: LockErrorResponseDto, description: 'Document is locked by another user' })
  async acquireLock(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentService.acquireLock(workspaceId, id, user.id);
  }

  @Put(':id/lock')
  @ApiOperation({ summary: 'Refresh edit lock (heartbeat)' })
  @ApiResponse({ status: 200, type: LockResponseDto })
  @ApiResponse({ status: 409, description: 'Lock not held by this user' })
  async refreshLock(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentService.refreshLock(workspaceId, id, user.id);
  }

  @Delete(':id/lock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Release edit lock' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Lock not held by this user' })
  async releaseLock(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.documentService.releaseLock(workspaceId, id, user.id);
  }

  // ============ SPEC-018: Trigger Processing ============

  @Post(':id/process')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger immediate document processing (indexing)' })
  @ApiResponse({ status: 202, description: 'Processing triggered' })
  async triggerProcessing(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentService.triggerProcessing(workspaceId, id, user.id);
  }

  // ============ Draft/Publish Lifecycle ============

  @Post(':id/save-draft')
  @ApiOperation({
    summary: 'Save document draft',
    description: 'Saves draft title and/or content. Draft is isolated from RAG search and InstructionSets. Requires OWNER or ADMIN role.',
  })
  @ApiResponse({ status: 200, type: SaveDraftResponseDto })
  @ApiResponse({ status: 403, description: 'Only owner or admin can save drafts' })
  @ApiResponse({ status: 409, type: ConflictErrorResponseDto, description: 'Document was modified by another user' })
  @ApiResponse({ status: 423, type: LockErrorResponseDto, description: 'Document is locked by another user' })
  async saveDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SaveDraftDto,
  ) {
    return this.documentService.saveDraft(workspaceId, id, user.id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({
    summary: 'Publish document draft',
    description: 'Publishes draft to production. Triggers reprocessing (chunking/embeddings) if content changed. Requires OWNER or ADMIN role.',
  })
  @ApiResponse({ status: 200, type: PublishDocumentResponseDto })
  @ApiResponse({ status: 400, description: 'No draft to publish' })
  @ApiResponse({ status: 403, description: 'Only owner or admin can publish' })
  @ApiResponse({ status: 409, type: ConflictErrorResponseDto, description: 'Document was modified by another user' })
  @ApiResponse({ status: 423, type: LockErrorResponseDto, description: 'Document is locked by another user' })
  async publishDocument(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: PublishDocumentDto,
  ) {
    return this.documentService.publishDocument(workspaceId, id, user.id, dto);
  }

  @Post(':id/discard-draft')
  @ApiOperation({
    summary: 'Discard document draft',
    description: 'Discards draft and returns to published version. Requires OWNER or ADMIN role.',
  })
  @ApiResponse({ status: 200, type: DiscardDraftResponseDto })
  @ApiResponse({ status: 403, description: 'Only owner or admin can discard drafts' })
  @ApiResponse({ status: 409, type: ConflictErrorResponseDto, description: 'Document was modified by another user' })
  @ApiResponse({ status: 423, type: LockErrorResponseDto, description: 'Document is locked by another user' })
  async discardDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: DiscardDraftDto,
  ) {
    return this.documentService.discardDraft(workspaceId, id, user.id, dto);
  }
}
