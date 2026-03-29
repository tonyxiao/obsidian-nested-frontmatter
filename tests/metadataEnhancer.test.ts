import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { enhanceMetadataProperty, refreshStructuredMetadata, STRUCTURED_PROPERTY_CLASS, STRUCTURED_VALUE_CLASS } from '../src/metadataEnhancer';

function createPropertyDom(valueText: string): HTMLElement {
  const dom = new JSDOM(`
    <div class="metadata-property" data-property-key="reservation_segments">
      <div class="metadata-property-value" data-property-type="unknown">
        <span class="metadata-property-value-item mod-unknown" tabindex="0">${valueText}</span>
      </div>
    </div>
  `);
  return dom.window.document.querySelector('.metadata-property') as HTMLElement;
}

describe('metadata enhancer', () => {
  it('renders nested structured values into the property row', () => {
    const propertyEl = createPropertyDom('[{"listing":"[[room-a]]","status":"interested"}]');
    const openLink = vi.fn();

    const enhanced = enhanceMetadataProperty(propertyEl, { openLink });

    expect(enhanced).toBe(true);
    const value = propertyEl.querySelector('.metadata-property-value') as HTMLElement;
    expect(value.classList.contains(STRUCTURED_PROPERTY_CLASS)).toBe(true);
    expect(value.querySelector('.metadata-property-value-item')?.getAttribute('style')).toContain('display: none');
    expect(value.querySelector(`.${STRUCTURED_VALUE_CLASS}`)?.textContent).toContain('room-a');
    expect(value.querySelector('.onf-link')?.textContent).toBe('room-a');
  });

  it('opens nested wikilinks on single click', () => {
    const propertyEl = createPropertyDom('[{"listing":"[[room-a]]"}]');
    const openLink = vi.fn();

    enhanceMetadataProperty(propertyEl, { openLink });
    const link = propertyEl.querySelector('.onf-native-link') as HTMLElement;
    link.dispatchEvent(new propertyEl.ownerDocument.defaultView!.MouseEvent('click', { bubbles: true }));

    expect(openLink).toHaveBeenCalledWith('room-a');
  });

  it('does not rerender unchanged structured content', () => {
    const propertyEl = createPropertyDom('[{"listing":"[[room-a]]"}]');
    const openLink = vi.fn();

    enhanceMetadataProperty(propertyEl, { openLink });
    const firstNode = propertyEl.querySelector(`.${STRUCTURED_VALUE_CLASS}`);
    const secondResult = enhanceMetadataProperty(propertyEl, { openLink });

    expect(secondResult).toBe(true);
    expect(propertyEl.querySelector(`.${STRUCTURED_VALUE_CLASS}`)).toBe(firstNode);
  });

  it('enhances all matching properties within a container', () => {
    const dom = new JSDOM(`
      <div>
        <div class="metadata-property"><div class="metadata-property-value"><span class="metadata-property-value-item">[{"listing":"[[room-a]]"}]</span></div></div>
        <div class="metadata-property"><div class="metadata-property-value"><span class="metadata-property-value-item">plain</span></div></div>
      </div>
    `);

    const count = refreshStructuredMetadata(dom.window.document, { openLink: vi.fn() });
    expect(count).toBe(1);
  });
});
