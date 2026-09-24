import generatedCatalog from '../generated/ai-tool-catalog.json';

export type AIToolEffect = 'read' | 'external_write' | 'message' | 'publish' | 'money';

export type AIToolCapabilityProjection = {
  id: string;
  title: string;
  description: string;
  effect: AIToolEffect;
  ownerApproval: 'install' | 'per_invocation';
};

export type AIToolPackageProjection = {
  id: string;
  serverName: string;
  title: string;
  description: string;
  version: string;
  kind: 'model_provider' | 'remote_tool' | 'service_cell';
  entryKind: 'template' | 'package';
  validationState: 'schema_valid';
  publisherTrust: 'publisher_unverified' | 'metadata_reviewed';
  runtimeState: 'catalog_only';
  registryState: 'catalog_only' | 'approved';
  signatureState: 'not_required_template' | 'unverified' | 'verified';
  publisherName: string;
  packageFormat: string;
  manifestSha256: string;
  capabilities: AIToolCapabilityProjection[];
};

export type AIToolCatalogProjection = {
  schemaVersion: 1;
  source: string;
  executionEnabled: false;
  supportedPackageTypes: string[];
  packages: AIToolPackageProjection[];
};

export const aiToolCatalog = generatedCatalog as AIToolCatalogProjection;
