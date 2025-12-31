import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { DocumentListToolbar } from '../DocumentListToolbar';
import { ProcessingStatus, VerificationStatus } from '../../types';

function ToolbarHarness() {
  const [searchParams] = useSearchParams();
  const verificationStatus = searchParams.get('verificationStatus') as VerificationStatus | null;
  const processingStatus = searchParams.get('processingStatus') as ProcessingStatus | null;

  return (
    <div>
      <DocumentListToolbar
        totalCount={12}
        verificationStatus={verificationStatus}
        processingStatus={processingStatus}
        onUploadClick={() => {}}
        onNewTextClick={() => {}}
      />
      <div data-testid="location-search">?{searchParams.toString()}</div>
    </div>
  );
}

describe('DocumentListToolbar', () => {
  it('should update query params and reset page when filter changes', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/?tab=documents&processingStatus=FAILED&page=3']}>
        <Routes>
          <Route path="/" element={<ToolbarHarness />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole('radio', { name: 'Unverified' }));

    const locationSearch = screen.getByTestId('location-search').textContent || '';
    expect(locationSearch).toContain('tab=documents');
    expect(locationSearch).toContain('processingStatus=FAILED');
    expect(locationSearch).toContain('verificationStatus=UNVERIFIED');
    expect(locationSearch).toContain('page=1');
  });

  it('should support arrow key navigation for segmented controls', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/?tab=documents']}>
        <Routes>
          <Route path="/" element={<ToolbarHarness />} />
        </Routes>
      </MemoryRouter>
    );

    const verificationGroup = screen.getByRole('radiogroup', { name: 'Verification filter' });
    const allOption = within(verificationGroup).getByRole('radio', { name: 'All' });
    allOption.focus();
    await user.keyboard('{ArrowRight}');

    const locationSearch = screen.getByTestId('location-search').textContent || '';
    expect(locationSearch).toContain('verificationStatus=VERIFIED');
    expect(locationSearch).toContain('page=1');
  });
});
