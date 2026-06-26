export type FrontendFramework =
  | 'react'
  | 'vue'
  | 'angular'
  | 'next'
  | 'nuxt'
  | 'solid'
  | 'javascript';

export interface FrameworkDetection {
  framework: FrontendFramework;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}
