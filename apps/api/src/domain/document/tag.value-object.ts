export class Tag {
  private constructor(private readonly value: string) {}

  static create(value: string): Tag {
    const normalized = value.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    if (normalized.length === 0) {
      throw new Error('Tag cannot be empty');
    }
    if (normalized.length > 50) {
      throw new Error('Tag cannot exceed 50 characters');
    }
    return new Tag(normalized);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: Tag): boolean {
    return this.value === other.value;
  }
}
