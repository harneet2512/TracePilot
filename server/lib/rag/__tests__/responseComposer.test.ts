/**
 * Unit tests for Response Composer
 * 
 * Tests the enterprise answer presentation layer that transforms
 * structured extraction data into polished Markdown with citation markers.
 */

import { describe, it, expect } from 'vitest';
import {
  composeEnterpriseAnswer,
  buildOrderedSources,
  dedupeCitations
} from '../responseComposer';
import type { Section, Citation } from '@shared/schema';

describe('responseComposer', () => {
  describe('buildOrderedSources', () => {
    it('should order sources by first citation appearance', () => {
      const sections: Section[] = [
        {
          title: 'Objective 1',
          items: [
            {
              text: 'KR 1',
              kind: 'kr',
              citations: [{ sourceId: 's2', chunkId: 'c2' }]
            },
            {
              text: 'KR 2',
              kind: 'kr',
              citations: [{ sourceId: 's1', chunkId: 'c1' }]
            }
          ]
        }
      ];

      const evidence = [
        { id: 's1', title: 'Source 1', connectorType: 'drive', connectorLabel: 'Drive' },
        { id: 's2', title: 'Source 2', connectorType: 'drive', connectorLabel: 'Drive' }
      ];

      const { sourceIndex, orderedEvidence } = buildOrderedSources(sections, evidence);

      // s2 appears first in sections, so it should be index 1
      expect(sourceIndex.get('s2')).toBe(1);
      expect(sourceIndex.get('s1')).toBe(2);
      expect(orderedEvidence[0].id).toBe('s2');
      expect(orderedEvidence[1].id).toBe('s1');
    });

    it('should handle sections with no citations', () => {
      const sections: Section[] = [
        {
          title: 'Objective 1',
          items: [
            { text: 'KR 1', kind: 'kr' } // No citations
          ]
        }
      ];

      const evidence = [
        { id: 's1', title: 'Source 1', connectorType: 'drive', connectorLabel: 'Drive' }
      ];

      const { sourceIndex, orderedEvidence } = buildOrderedSources(sections, evidence);

      // Evidence not cited in sections should still be included at the end
      expect(orderedEvidence.length).toBe(1);
      expect(sourceIndex.get('s1')).toBe(1);
    });
  });

  describe('dedupeCitations', () => {
    it('should dedupe citations by sourceId+chunkId+charStart+charEnd', () => {
      const citations: Citation[] = [
        { sourceId: 's1', chunkId: 'c1', charStart: 0, charEnd: 100 },
        { sourceId: 's1', chunkId: 'c1', charStart: 0, charEnd: 100 }, // Exact duplicate
        { sourceId: 's1', chunkId: 'c2', charStart: 0, charEnd: 50 },  // Different chunk
        { sourceId: 's2', chunkId: 'c1', charStart: 0, charEnd: 100 }, // Different source
      ];

      const deduped = dedupeCitations(citations);

      expect(deduped.length).toBe(3);
      expect(deduped[0]).toEqual({ sourceId: 's1', chunkId: 'c1', charStart: 0, charEnd: 100 });
      expect(deduped[1]).toEqual({ sourceId: 's1', chunkId: 'c2', charStart: 0, charEnd: 50 });
      expect(deduped[2]).toEqual({ sourceId: 's2', chunkId: 'c1', charStart: 0, charEnd: 100 });
    });

    it('should handle citations without charStart/charEnd', () => {
      const citations: Citation[] = [
        { sourceId: 's1', chunkId: 'c1' },
        { sourceId: 's1', chunkId: 'c1' }, // Duplicate without char positions
        { sourceId: 's1', chunkId: 'c1', charStart: 0, charEnd: 100 }, // Different (has char positions)
      ];

      const deduped = dedupeCitations(citations);

      expect(deduped.length).toBe(2);
    });

    it('should preserve first occurrence', () => {
      const citations: Citation[] = [
        { sourceId: 's1', chunkId: 'c1', charStart: 0, charEnd: 100, label: 'first' } as Citation,
        { sourceId: 's1', chunkId: 'c1', charStart: 0, charEnd: 100, label: 'second' } as Citation,
      ];

      const deduped = dedupeCitations(citations);

      expect(deduped.length).toBe(1);
      expect((deduped[0] as any).label).toBe('first');
    });
  });

  describe('composeEnterpriseAnswer', () => {
    it('should render markdown with citation markers', () => {
      const sections: Section[] = [
        {
          title: 'Improve AI Search',
          items: [
            {
              text: 'Reduce p95 latency to 2 seconds',
              kind: 'kr',
              owner: 'Sarah Chen',
              target: '2s',
              current: '5.2s',
              status: 'At Risk',
              citations: [{ sourceId: 's1', chunkId: 'c1' }]
            },
            {
              text: 'Increase user satisfaction',
              kind: 'kr',
              owner: 'Mike',
              target: '4.5/5',
              citations: [
                { sourceId: 's1', chunkId: 'c1' },
                { sourceId: 's2', chunkId: 'c2' }
              ]
            }
          ]
        }
      ];

      const evidence = [
        { id: 's1', title: 'Q4_OKRs.pdf', connectorType: 'drive', connectorLabel: 'Drive' },
        { id: 's2', title: 'Architecture.pdf', connectorType: 'drive', connectorLabel: 'Drive' }
      ];

      const result = composeEnterpriseAnswer({
        sections,
        framingContext: 'Here are the Q4 2024 OKRs for AI search',
        summary: 'Nov 15 launch • 2s p95 target',
        evidence
      });

      // Should contain framing context
      expect(result.renderedAnswer).toContain('Here are the Q4 2024 OKRs for AI search');
      expect(result.renderedAnswer).toContain('(from 2 sources)');

      // Should contain key facts
      expect(result.renderedAnswer).toContain('**Key facts:**');
      expect(result.renderedAnswer).toContain('Nov 15 launch');

      // Should contain citation markers
      expect(result.renderedAnswer).toContain('[1]');
      expect(result.renderedAnswer).toContain('[2]');

      // Should have ordered sources
      expect(result.orderedSources.length).toBe(2);
      expect(result.orderedSources[0].id).toBe('s1');
    });

    it('should not show citation markers for single-source answers', () => {
      const sections: Section[] = [
        {
          title: 'Objective',
          items: [
            {
              text: 'KR 1',
              kind: 'kr',
              citations: [{ sourceId: 's1', chunkId: 'c1' }]
            }
          ]
        }
      ];

      const evidence = [
        { id: 's1', title: 'Source.pdf', connectorType: 'drive', connectorLabel: 'Drive' }
      ];

      const result = composeEnterpriseAnswer({
        sections,
        evidence
      });

      // Single source - should NOT show [1] marker
      expect(result.renderedAnswer).not.toContain('[1]');
      expect(result.orderedSources.length).toBe(1);
    });

    it('should format KR metadata inline with em-dashes', () => {
      const sections: Section[] = [
        {
          title: 'Objective',
          items: [
            {
              text: 'Reduce latency',
              kind: 'kr',
              owner: 'Sarah',
              target: '2s',
              current: '5s',
              status: 'At Risk',
              due: 'Nov 15',
              citations: [{ sourceId: 's1', chunkId: 'c1' }, { sourceId: 's2', chunkId: 'c2' }]
            }
          ]
        }
      ];

      const evidence = [
        { id: 's1', title: 'Source 1', connectorType: 'drive', connectorLabel: 'Drive' },
        { id: 's2', title: 'Source 2', connectorType: 'drive', connectorLabel: 'Drive' }
      ];

      const result = composeEnterpriseAnswer({ sections, evidence });

      // Should contain metadata formatted with parenthetical context (no em dashes)
      expect(result.renderedAnswer).toContain('owner: Sarah');
      expect(result.renderedAnswer).toContain('target: 2s');
      expect(result.renderedAnswer).toContain('current: 5s');
      expect(result.renderedAnswer).toContain('At Risk');
      expect(result.renderedAnswer).toContain('due Nov 15');
      expect(result.renderedAnswer).not.toContain(' — '); // No em dashes
    });

    it('should collect and dedupe citations from sections', () => {
      const sections: Section[] = [
        {
          title: 'Objective',
          items: [
            {
              text: 'KR 1',
              kind: 'kr',
              citations: [
                { sourceId: 's1', chunkId: 'c1', charStart: 0, charEnd: 100 },
                { sourceId: 's1', chunkId: 'c1', charStart: 0, charEnd: 100 } // Duplicate
              ]
            }
          ]
        }
      ];

      const evidence = [
        { id: 's1', title: 'Source', connectorType: 'drive', connectorLabel: 'Drive' }
      ];

      const result = composeEnterpriseAnswer({ sections, evidence });

      // Should dedupe citations
      expect(result.dedupedCitations.length).toBe(1);
    });
  });
});
