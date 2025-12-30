import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/application/auth/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserData,
} from '@/application/auth/current-user.decorator';
import { InstructionSetService } from '@/application/instruction-set/instruction-set.service';
import {
  CreateInstructionSetDto,
  UpdateInstructionSetDto,
  AddDocumentDto,
  ReorderDocumentsDto,
  InstructionSetResponseDto,
  InstructionSetDetailResponseDto,
  InstructionSetListResponseDto,
  AddDocumentResponseDto,
  ReorderDocumentsResponseDto,
  ErrorResponseDto,
} from '../dto/instruction-set.dto';

@ApiTags('Instruction Sets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/instruction-sets')
export class InstructionSetController {
  constructor(private readonly instructionSetService: InstructionSetService) {}

  @Get()
  @ApiOperation({ summary: 'List instruction sets in workspace' })
  @ApiResponse({ status: 200, type: InstructionSetListResponseDto })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.instructionSetService.findAll(workspaceId, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new instruction set' })
  @ApiResponse({ status: 201, type: InstructionSetResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'Validation error or limit exceeded' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateInstructionSetDto,
  ) {
    return this.instructionSetService.create(workspaceId, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get instruction set details' })
  @ApiResponse({ status: 200, type: InstructionSetDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Instruction set not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.instructionSetService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update instruction set' })
  @ApiResponse({ status: 200, type: InstructionSetDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Instruction set not found' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateInstructionSetDto,
  ) {
    return this.instructionSetService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete instruction set' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Instruction set not found' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.instructionSetService.delete(id, user.id);
  }

  // ============ Document Management ============

  @Post(':id/documents')
  @ApiOperation({ summary: 'Add document to instruction set' })
  @ApiResponse({ status: 201, type: AddDocumentResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'Size or document limit exceeded' })
  @ApiResponse({ status: 404, description: 'Instruction set or document not found' })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'Document already in set' })
  async addDocument(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AddDocumentDto,
  ) {
    return this.instructionSetService.addDocument(id, user.id, dto);
  }

  @Delete(':id/documents/:docId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove document from instruction set' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Instruction set or document not found' })
  async removeDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.instructionSetService.removeDocument(id, docId, user.id);
  }

  @Patch(':id/documents/reorder')
  @ApiOperation({ summary: 'Reorder documents in instruction set' })
  @ApiResponse({ status: 200, type: ReorderDocumentsResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: 'Invalid document IDs' })
  @ApiResponse({ status: 404, description: 'Instruction set not found' })
  async reorderDocuments(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ReorderDocumentsDto,
  ) {
    return this.instructionSetService.reorderDocuments(id, user.id, dto);
  }
}
