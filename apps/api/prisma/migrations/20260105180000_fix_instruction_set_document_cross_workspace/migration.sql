-- Fix InstructionSetDocument RLS policy to prevent cross-workspace document access
-- Security fix: Verify that both InstructionSet AND Document belong to current workspace

-- Drop existing policy
DROP POLICY IF EXISTS instruction_set_document_all ON "InstructionSetDocument";

-- Create fixed policy that checks both InstructionSet and Document workspace
CREATE POLICY instruction_set_document_all ON "InstructionSetDocument"
  FOR ALL
  TO PUBLIC
  USING (
    -- For SELECT/UPDATE/DELETE: InstructionSet must belong to current workspace
    EXISTS (
      SELECT 1 FROM "InstructionSet"
      WHERE "InstructionSet"."id" = "InstructionSetDocument"."instructionSetId"
        AND "InstructionSet"."workspaceId" = get_current_workspace_id()
    )
  )
  WITH CHECK (
    -- For INSERT/UPDATE: Both InstructionSet AND Document must belong to current workspace
    EXISTS (
      SELECT 1 FROM "InstructionSet"
      WHERE "InstructionSet"."id" = "InstructionSetDocument"."instructionSetId"
        AND "InstructionSet"."workspaceId" = get_current_workspace_id()
    )
    AND EXISTS (
      SELECT 1 FROM "Document"
      WHERE "Document"."id" = "InstructionSetDocument"."documentId"
        AND "Document"."workspaceId" = get_current_workspace_id()
    )
  );

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'InstructionSetDocument RLS policy fixed - now checks both InstructionSet AND Document workspace';
END $$;
