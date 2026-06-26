import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined') {
  const getComputedStyle = window.getComputedStyle.bind(window);

  Object.defineProperty(window, 'getComputedStyle', {
    writable: true,
    value: (element: Element) => getComputedStyle(element),
  });

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: () => {},
  });
}
