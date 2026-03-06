import { withIntegrationThroughApi } from './integration-variants/with-integration-through-api';
import { withIntegrationThroughLocalStorage } from './integration-variants/with-integration-through-local-storage';
import { withIntegrationThroughProps } from './integration-variants/with-integration-through-props';
import { withIntegrationThroughR360Api } from './integration-variants/with-integration-through-r360-api';

const hocByStrategy = {
  API: withIntegrationThroughApi,
  LOCAL_STORAGE: withIntegrationThroughLocalStorage,
  PROPS: withIntegrationThroughProps,
  R360_API: withIntegrationThroughR360Api,
} as const;

type IntegrationStrategy = keyof typeof hocByStrategy;

const envStrategy = import.meta.env.VITE_INTEGRATION_STRATEGY as IntegrationStrategy | undefined;

/*
  Pick the hocByStrategy that fits your usage best.

  Set VITE_INTEGRATION_STRATEGY in your .env to override:
    - LOCAL_STORAGE (default) — persists to browser localStorage
    - API — generic API integration skeleton
    - R360_API — connects to the R360 Flow API with auth and tenant context
    - PROPS — receives data and callbacks via component props
*/
export const withIntegration =
  envStrategy && envStrategy in hocByStrategy ? hocByStrategy[envStrategy] : hocByStrategy.LOCAL_STORAGE;
