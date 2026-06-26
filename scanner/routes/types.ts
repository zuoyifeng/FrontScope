export type RouteCandidateSource =
  | 'next-app'
  | 'next-pages'
  | 'nuxt-pages'
  | 'vue-router'
  | 'react-router'
  | 'angular-router'
  | 'solid-router'
  | 'runtime-link';

export interface RouteCandidate {
  path: string;
  source: RouteCandidateSource;
  confidence: 'high' | 'medium' | 'low';
  file?: string;
  reason: string;
  requiresAuth?: boolean;
}
