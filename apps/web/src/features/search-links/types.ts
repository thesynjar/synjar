export interface SearchLink {
  id: string;
  token: string;
  workspaceId: string;
  name: string | null;
  allowedTags: string[];
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateSearchLinkDto {
  name?: string;
  allowedTags?: string[];
  expiresAt?: string;
}

export interface Tag {
  id: string;
  name: string;
}
