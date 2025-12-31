import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerificationBadge } from '../VerificationBadge';

describe('VerificationBadge', () => {
  it('should render verified badge with aria label', () => {
    render(<VerificationBadge status="VERIFIED" />);

    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByLabelText('Trusted - used in Search and Instruction Sets')).toBeInTheDocument();
  });

  it('should render unverified badge with aria label', () => {
    render(<VerificationBadge status="UNVERIFIED" />);

    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Not used in Search and Instruction Sets by default, can be included in Search')
    ).toBeInTheDocument();
  });
});
