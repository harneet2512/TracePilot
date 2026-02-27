/**
 * Tests for DocAnswer component enterprise UX
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocAnswer } from '../DocAnswer';

describe('DocAnswer rendering', () => {
  it('should render compact inline metadata in bracket notation', () => {
    const sections = [
      {
        title: 'Objective: Ship AI Search',
        items: [
          {
            text: 'Achieve 2s p95 latency for search queries',
            kind: 'kr' as const,
            owner: 'Jordan',
            target: '2s p95',
            current: '5.2s p95',
            due: 'Nov 15',
            citations: []
          }
        ]
      }
    ];

    const { container } = render(
      <DocAnswer
        sections={sections}
        evidence={[]}
        isSingleSource={true}
      />
    );

    // Verify inline metadata appears in bracket notation
    expect(container.textContent).toContain('[Owner: Jordan]');
    expect(container.textContent).toContain('[Target: 2s p95]');
    expect(container.textContent).toContain('[Current: 5.2s p95]');
    expect(container.textContent).toContain('[Due: Nov 15]');
  });

  it('should show evidence panel with Open and Location buttons', () => {
    const sections = [
      {
        title: 'Objective 1',
        items: [
          {
            text: 'Item 1',
            kind: 'kr' as const,
            citations: [{ sourceId: 's1', chunkId: 'c1' }]
          }
        ]
      }
    ];

    const evidence = [
      {
        id: 's1',
        title: 'Q4_OKRs.pdf',
        url: 'https://docs.google.com/document/d/xyz/edit',
        locationUrl: 'https://drive.google.com/drive/folders/abc',
        connectorType: 'drive',
        connectorLabel: 'Drive',
        whyUsed: 'Referenced in 1 item'
      },
      {
        id: 's2',
        title: 'Roadmap.pdf',
        url: 'https://docs.google.com/document/d/123/edit',
        locationUrl: 'https://drive.google.com/drive/folders/def',
        connectorType: 'drive',
        connectorLabel: 'Drive'
      }
    ];

    const { getByText } = render(
      <DocAnswer
        sections={sections}
        evidence={evidence}
        isSingleSource={false}
      />
    );

    // Verify Evidence heading
    expect(getByText('Evidence (2)')).toBeInTheDocument();

    // Verify Open buttons
    const openButtons = screen.getAllByText('Open');
    expect(openButtons).toHaveLength(2);

    // Verify Location buttons
    const locationButtons = screen.getAllByText(/Location \(Drive\)/);
    expect(locationButtons).toHaveLength(2);

    // Verify titles
    expect(getByText('Q4_OKRs.pdf')).toBeInTheDocument();
    expect(getByText('Roadmap.pdf')).toBeInTheDocument();

    // Verify whyUsed
    expect(getByText('Referenced in 1 item')).toBeInTheDocument();
  });

  it('should disable Location button when locationUrl is null', () => {
    const sections = [
      {
        title: 'Objective 1',
        items: [
          {
            text: 'Item 1',
            kind: 'kr' as const,
            citations: [{ sourceId: 's1', chunkId: 'c1' }]
          }
        ]
      }
    ];

    const evidence = [
      {
        id: 's1',
        title: 'Slack_message.txt',
        url: 'https://workspace.slack.com/archives/C123/p456',
        locationUrl: undefined, // No location URL
        connectorType: 'slack',
        connectorLabel: 'Slack'
      }
    ];

    const { container } = render(
      <DocAnswer
        sections={[sections[0]]}
        evidence={evidence}
        isSingleSource={false}
      />
    );

    // Find disabled Location button
    const locationButton = container.querySelector('button[disabled][title="Location unavailable"]');
    expect(locationButton).toBeInTheDocument();
    expect(locationButton?.textContent).toBe('Location');
  });

  it('should show citation markers [1][2] for multi-source', () => {
    const sections = [
      {
        title: 'Objective 1',
        items: [
          {
            text: 'Multi-source item',
            kind: 'kr' as const,
            citations: [
              { sourceId: 's1', chunkId: 'c1' },
              { sourceId: 's2', chunkId: 'c2' }
            ]
          }
        ]
      }
    ];

    const evidence = [
      { id: 's1', title: 'Source 1', connectorType: 'drive', connectorLabel: 'Drive' },
      { id: 's2', title: 'Source 2', connectorType: 'drive', connectorLabel: 'Drive' }
    ];

    const { getByText } = render(
      <DocAnswer
        sections={sections}
        evidence={evidence}
        isSingleSource={false}
      />
    );

    // Verify citation markers
    expect(getByText('[1]')).toBeInTheDocument();
    expect(getByText('[2]')).toBeInTheDocument();
  });

  it('should hide citation markers for single-source', () => {
    const sections = [
      {
        title: 'Objective 1',
        items: [
          {
            text: 'Single-source item',
            kind: 'kr' as const,
            citations: [
              { sourceId: 's1', chunkId: 'c1' }
            ]
          }
        ]
      }
    ];

    const evidence = [
      { id: 's1', title: 'Source 1', connectorType: 'drive', connectorLabel: 'Drive' }
    ];

    const { container, queryByText } = render(
      <DocAnswer
        sections={sections}
        evidence={evidence}
        isSingleSource={true}
      />
    );

    // Verify NO citation markers
    expect(queryByText('[1]')).not.toBeInTheDocument();

    // Verify single-source footer instead
    expect(container.textContent).toContain('Source: Source 1');
  });

  it('should render framing sentence with source summary', () => {
    const { getByText } = render(
      <DocAnswer
        framingContext="Here are the Q4 OKRs for the AI Search project"
        sourceSummary="from 3 sources"
        sections={[]}
        evidence={[]}
        isSingleSource={false}
      />
    );

    expect(getByText(/Here are the Q4 OKRs for the AI Search project/)).toBeInTheDocument();
    expect(getByText(/\(from 3 sources\)/)).toBeInTheDocument();
  });

  it('should render executive summary as bullet list', () => {
    const { getByText } = render(
      <DocAnswer
        summary="Nov 15 launch • 2s p95 target • $180K budget"
        sections={[]}
        evidence={[]}
        isSingleSource={false}
      />
    );

    expect(getByText('Key Facts')).toBeInTheDocument();
    expect(getByText('Nov 15 launch')).toBeInTheDocument();
    expect(getByText('2s p95 target')).toBeInTheDocument();
    expect(getByText('$180K budget')).toBeInTheDocument();
  });

  it('should scroll to evidence when citation marker is clicked', () => {
    const scrollIntoViewMock = vi.fn();
    global.Element.prototype.scrollIntoView = scrollIntoViewMock;

    const sections = [
      {
        title: 'Objective 1',
        items: [
          {
            text: 'Item',
            kind: 'kr' as const,
            citations: [{ sourceId: 's2', chunkId: 'c2' }]
          }
        ]
      }
    ];

    const evidence = [
      { id: 's1', title: 'Source 1', connectorType: 'drive', connectorLabel: 'Drive' },
      { id: 's2', title: 'Source 2', connectorType: 'drive', connectorLabel: 'Drive' }
    ];

    const { getByText } = render(
      <DocAnswer
        sections={sections}
        evidence={evidence}
        isSingleSource={false}
      />
    );

    // Click the [2] marker
    const marker = getByText('[2]');
    fireEvent.click(marker);

    // Verify scrollIntoView was called
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest'
    });
  });

  it('should open URL in new tab when Open button is clicked', () => {
    const windowOpenMock = vi.fn();
    global.window.open = windowOpenMock;

    const sections = [
      {
        title: 'Objective 1',
        items: [
          {
            text: 'Item',
            kind: 'kr' as const,
            citations: [{ sourceId: 's1', chunkId: 'c1' }]
          }
        ]
      }
    ];

    const evidence = [
      {
        id: 's1',
        title: 'Doc',
        url: 'https://docs.google.com/document/d/xyz/edit',
        locationUrl: 'https://drive.google.com/drive/folders/abc',
        connectorType: 'drive',
        connectorLabel: 'Drive'
      }
    ];

    const { getAllByText } = render(
      <DocAnswer
        sections={sections}
        evidence={evidence}
        isSingleSource={false}
      />
    );

    // Click Open button
    const openButton = getAllByText('Open')[0];
    fireEvent.click(openButton);

    // Verify window.open was called with correct URL
    expect(windowOpenMock).toHaveBeenCalledWith(
      'https://docs.google.com/document/d/xyz/edit',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('should remove numbered circle badges from section headings', () => {
    const sections = [
      {
        title: 'Objective: Ship AI Search',
        items: []
      }
    ];

    const { container } = render(
      <DocAnswer
        sections={sections}
        evidence={[]}
        isSingleSource={true}
      />
    );

    // Verify heading exists
    expect(container.textContent).toContain('Objective: Ship AI Search');

    // Verify NO circular badge elements
    const badges = container.querySelectorAll('.rounded-full');
    // Should only be evidence index badges, not section number badges
    expect(badges.length).toBe(0);
  });

  it('should render citation-backed keyFacts with citation markers', () => {
    const sections = [
      {
        title: 'Objective 1',
        items: [
          {
            text: 'KR 1',
            kind: 'kr' as const,
            citations: [{ sourceId: 's1', chunkId: 'c1' }]
          }
        ]
      }
    ];

    const evidence = [
      { id: 's1', title: 'Source 1', connectorType: 'drive', connectorLabel: 'Drive' },
      { id: 's2', title: 'Source 2', connectorType: 'drive', connectorLabel: 'Drive' }
    ];

    const keyFacts = [
      { text: 'Nov 15 deadline', citations: [{ sourceId: 's1', chunkId: 'c1' }] },
      { text: '2s p95 target', citations: [{ sourceId: 's2', chunkId: 'c2' }] }
    ];

    const { getByText } = render(
      <DocAnswer
        keyFacts={keyFacts}
        sections={sections}
        evidence={evidence}
        isSingleSource={false}
      />
    );

    // Verify Key Facts header
    expect(getByText('Key Facts')).toBeInTheDocument();
    // Verify fact text
    expect(getByText(/Nov 15 deadline/)).toBeInTheDocument();
    expect(getByText(/2s p95 target/)).toBeInTheDocument();
    // Verify citation markers on facts
    const markers = document.querySelectorAll('button.font-mono');
    expect(markers.length).toBeGreaterThan(0);
  });

  it('should prefer keyFacts over summary', () => {
    const keyFacts = [
      { text: 'Cited fact', citations: [{ sourceId: 's1', chunkId: 'c1' }] }
    ];

    const { getByText, queryByText } = render(
      <DocAnswer
        summary="Uncited summary fact"
        keyFacts={keyFacts}
        sections={[]}
        evidence={[{ id: 's1', title: 'S1', connectorType: 'drive', connectorLabel: 'Drive' }]}
        isSingleSource={false}
      />
    );

    // keyFacts should be shown
    expect(getByText(/Cited fact/)).toBeInTheDocument();
    // summary should NOT be shown (keyFacts takes priority)
    expect(queryByText(/Uncited summary/)).not.toBeInTheDocument();
  });

  it('should fall back to summary when keyFacts is empty', () => {
    const { getByText } = render(
      <DocAnswer
        summary="Nov 15 launch • 2s p95 target"
        keyFacts={[]}
        sections={[]}
        evidence={[]}
        isSingleSource={false}
      />
    );

    expect(getByText('Key Facts')).toBeInTheDocument();
    expect(getByText('Nov 15 launch')).toBeInTheDocument();
  });

  it('should render Related section separately from Evidence', () => {
    const sections = [
      {
        title: 'Objective 1',
        items: [
          { text: 'Item', kind: 'kr' as const, citations: [{ sourceId: 's1', chunkId: 'c1' }] }
        ]
      }
    ];

    const evidence = [
      { id: 's1', title: 'Cited Source', connectorType: 'drive', connectorLabel: 'Drive' },
      { id: 's2', title: 'Also Cited', connectorType: 'drive', connectorLabel: 'Drive' }
    ];

    const relatedSources = [
      { id: 's3', title: 'Related Doc', connectorType: 'drive', connectorLabel: 'Drive' }
    ];

    const { getByText } = render(
      <DocAnswer
        sections={sections}
        evidence={evidence}
        relatedSources={relatedSources}
        isSingleSource={false}
      />
    );

    // Evidence section
    expect(getByText('Evidence (2)')).toBeInTheDocument();
    // Related section
    expect(getByText('Related (1)')).toBeInTheDocument();
  });

  it('should not render Related section when no related sources', () => {
    const { queryByText } = render(
      <DocAnswer
        sections={[]}
        evidence={[]}
        relatedSources={[]}
        isSingleSource={false}
      />
    );

    expect(queryByText(/Related/)).not.toBeInTheDocument();
  });
});
