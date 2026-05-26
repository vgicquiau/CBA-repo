import { RemovalPolicy, Duration } from 'aws-cdk-lib';

export type Stage = 'dev' | 'prod';

export interface StageConfig {
  stage: Stage;
  domain: string;
  apiDomain: string;
  cdnDomain: string;
  rootDomain: string;
  pointInTimeRecovery: boolean;
  seedMockBookings: boolean;
  xrayEnabled: boolean;
  logRetention: number; // days
  allowedOrigins: string[];
  removalPolicy: RemovalPolicy;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export const stageConfig: Record<Stage, StageConfig> = {
  dev: {
    stage: 'dev',
    domain: 'dev.clos-bon-accueil.fr',
    apiDomain: 'api.dev.clos-bon-accueil.fr',
    cdnDomain: 'cdn.dev.clos-bon-accueil.fr',
    rootDomain: 'clos-bon-accueil.fr',
    pointInTimeRecovery: false,
    seedMockBookings: true,
    xrayEnabled: false,
    logRetention: 7,
    allowedOrigins: [
      'http://localhost:5173',
      'https://dev.clos-bon-accueil.fr',
    ],
    removalPolicy: RemovalPolicy.DESTROY,
    logLevel: 'DEBUG',
  },
  prod: {
    stage: 'prod',
    domain: 'www.clos-bon-accueil.fr',
    apiDomain: 'api.clos-bon-accueil.fr',
    cdnDomain: 'cdn.clos-bon-accueil.fr',
    rootDomain: 'clos-bon-accueil.fr',
    pointInTimeRecovery: true,
    seedMockBookings: false,
    xrayEnabled: true,
    logRetention: 30,
    allowedOrigins: [
      'https://www.clos-bon-accueil.fr',
    ],
    removalPolicy: RemovalPolicy.RETAIN,
    logLevel: 'INFO',
  },
};

export function getStageConfig(stage: string): StageConfig {
  if (stage !== 'dev' && stage !== 'prod') {
    throw new Error(`Invalid stage: ${stage}. Must be 'dev' or 'prod'.`);
  }
  return stageConfig[stage as Stage];
}

// Used to name CDK stacks: ClosBonAccueil-{StackName}-{Stage}
export function stackName(name: string, cfg: StageConfig): string {
  return `ClosBonAccueil-${name}-${cfg.stage}`;
}

// SSM parameter path helper
export function ssmPath(cfg: StageConfig, ...segments: string[]): string {
  return `/clos/${cfg.stage}/${segments.join('/')}`;
}

// Duration re-export for convenience in stacks
export { Duration };
