import * as core from '@actions/core';
import * as handlebars from 'handlebars';

import {Build} from '@docker/actions-toolkit/lib/buildx/build';
import {Context} from '@docker/actions-toolkit/lib/context';
import {GitHub} from '@docker/actions-toolkit/lib/github';
import {Toolkit} from '@docker/actions-toolkit/lib/toolkit';
import {Util} from '@docker/actions-toolkit/lib/util';

export interface Inputs {
  addHosts: string[];
  allow: string[];
  annotations: string[];
  attests: string[];
  buildArgs: string[];
  buildContexts: string[];
  builder: string;
  cacheFrom: string[];
  cacheTo: string[];
  cgroupParent: string;
  context: string;
  file: string;
  labels: string[];
  load: boolean;
  network: string;
  noCache: boolean;
  noCacheFilters: string[];
  outputs: string[];
  platforms: string[];
  provenance: string;
  pull: boolean;
  push: boolean;
  sbom: string;
  secrets: string[];
  secretEnvs: string[];
  secretFiles: string[];
  shmSize: string;
  ssh: string[];
  tags: string[];
  target: string;
  ulimit: string[];
  githubToken: string;
}

export async function getInputs(): Promise<Inputs> {
  return {
    addHosts: Util.getInputList('add-hosts'),
    allow: Util.getInputList('allow'),
    annotations: Util.getInputList('annotations', {ignoreComma: true}),
    attests: Util.getInputList('attests', {ignoreComma: true}),
    buildArgs: Util.getInputList('build-args', {ignoreComma: true}),
    buildContexts: Util.getInputList('build-contexts', {ignoreComma: true}),
    builder: core.getInput('builder'),
    cacheFrom: Util.getInputList('cache-from', {ignoreComma: true}),
    cacheTo: Util.getInputList('cache-to', {ignoreComma: true}),
    cgroupParent: core.getInput('cgroup-parent'),
    context: core.getInput('context') || Context.gitContext(),
    file: core.getInput('file'),
    labels: Util.getInputList('labels', {ignoreComma: true}),
    load: core.getBooleanInput('load'),
    network: core.getInput('network'),
    noCache: core.getBooleanInput('no-cache'),
    noCacheFilters: Util.getInputList('no-cache-filters'),
    outputs: Util.getInputList('outputs', {ignoreComma: true, quote: false}),
    platforms: Util.getInputList('platforms'),
    provenance: Build.getProvenanceInput('provenance'),
    pull: core.getBooleanInput('pull'),
    push: core.getBooleanInput('push'),
    sbom: core.getInput('sbom'),
    secrets: Util.getInputList('secrets', {ignoreComma: true}),
    secretEnvs: Util.getInputList('secret-envs'),
    secretFiles: Util.getInputList('secret-files', {ignoreComma: true}),
    shmSize: core.getInput('shm-size'),
    ssh: Util.getInputList('ssh'),
    tags: Util.getInputList('tags'),
    target: core.getInput('target'),
    ulimit: Util.getInputList('ulimit', {ignoreComma: true}),
    githubToken: core.getInput('github-token')
  };
}

export async function getArgs(inputs: Inputs, toolkit: Toolkit): Promise<Array<string>> {
  const context = handlebars.compile(inputs.context)({
    defaultContext: Context.gitContext()
  });
  // prettier-ignore
  return [
    ...await getBuildArgs(inputs, context, toolkit),
    ...await getCommonArgs(inputs, toolkit),
    context
  ];
}

async function getBuildArgs(inputs: Inputs, context: string, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = ['build'];
  await Util.asyncForEach(inputs.addHosts, async addHost => {
    args.push('--add-host', addHost);
  });
  if (inputs.allow.length > 0) {
    args.push('--allow', inputs.allow.join(','));
  }
  if (await toolkit.buildx.versionSatisfies('>=0.12.0')) {
    await Util.asyncForEach(inputs.annotations, async annotation => {
      args.push('--annotation', annotation);
    });
  } else if (inputs.annotations.length > 0) {
    core.warning("Annotations are only supported by buildx >= 0.12.0; the input 'annotations' is ignored.");
  }
  await Util.asyncForEach(inputs.buildArgs, async buildArg => {
    args.push('--build-arg', buildArg);
  });
  if (await toolkit.buildx.versionSatisfies('>=0.8.0')) {
    await Util.asyncForEach(inputs.buildContexts, async buildContext => {
      args.push('--build-context', buildContext);
    });
  } else if (inputs.buildContexts.length > 0) {
    core.warning("Build contexts are only supported by buildx >= 0.8.0; the input 'build-contexts' is ignored.");
  }
  await Util.asyncForEach(inputs.cacheFrom, async cacheFrom => {
    args.push('--cache-from', cacheFrom);
  });
  await Util.asyncForEach(inputs.cacheTo, async cacheTo => {
    args.push('--cache-to', cacheTo);
  });
  if (inputs.cgroupParent) {
    args.push('--cgroup-parent', inputs.cgroupParent);
  }
  await Util.asyncForEach(inputs.secretEnvs, async secretEnv => {
    try {
      args.push('--secret', Build.resolveSecretEnv(secretEnv));
    } catch (err) {
      core.warning(err.message);
    }
  });
  if (inputs.file) {
    args.push('--file', inputs.file);
  }
  if (!Build.hasLocalExporter(inputs.outputs) && !Build.hasTarExporter(inputs.outputs) && (inputs.platforms.length == 0 || (await toolkit.buildx.versionSatisfies('>=0.4.2')))) {
    args.push('--iidfile', Build.getImageIDFilePath());
  }
  await Util.asyncForEach(inputs.labels, async label => {
    args.push('--label', label);
  });
  await Util.asyncForEach(inputs.noCacheFilters, async noCacheFilter => {
    args.push('--no-cache-filter', noCacheFilter);
  });
  await Util.asyncForEach(inputs.outputs, async output => {
    args.push('--output', output);
  });
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  if (await toolkit.buildx.versionSatisfies('>=0.10.0')) {
    args.push(...(await getAttestArgs(inputs, toolkit)));
  } else {
    core.warning("Attestations are only supported by buildx >= 0.10.0; the inputs 'attests', 'provenance' and 'sbom' are ignored.");
  }
  await Util.asyncForEach(inputs.secrets, async secret => {
    try {
      args.push('--secret', Build.resolveSecretString(secret));
    } catch (err) {
      core.warning(err.message);
    }
  });
  await Util.asyncForEach(inputs.secretFiles, async secretFile => {
    try {
      args.push('--secret', Build.resolveSecretFile(secretFile));
    } catch (err) {
      core.warning(err.message);
    }
  });
  if (inputs.githubToken && !Build.hasGitAuthTokenSecret(inputs.secrets) && context.startsWith(Context.gitContext())) {
    args.push('--secret', Build.resolveSecretString(`GIT_AUTH_TOKEN=${inputs.githubToken}`));
  }
  if (inputs.shmSize) {
    args.push('--shm-size', inputs.shmSize);
  }
  await Util.asyncForEach(inputs.ssh, async ssh => {
    args.push('--ssh', ssh);
  });
  await Util.asyncForEach(inputs.tags, async tag => {
    args.push('--tag', tag);
  });
  if (inputs.target) {
    args.push('--target', inputs.target);
  }
  await Util.asyncForEach(inputs.ulimit, async ulimit => {
    args.push('--ulimit', ulimit);
  });
  return args;
}

async function getCommonArgs(inputs: Inputs, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = [];
  if (inputs.builder) {
    args.push('--builder', inputs.builder);
  }
  if (inputs.load) {
    args.push('--load');
  }
  if (await toolkit.buildx.versionSatisfies('>=0.6.0')) {
    args.push('--metadata-file', Build.getMetadataFilePath());
  }
  if (inputs.network) {
    args.push('--network', inputs.network);
  }
  if (inputs.noCache) {
    args.push('--no-cache');
  }
  if (inputs.pull) {
    args.push('--pull');
  }
  if (inputs.push) {
    args.push('--push');
  }
  return args;
}

async function getAttestArgs(inputs: Inputs, toolkit: Toolkit): Promise<Array<string>> {
  const args: Array<string> = [];

  // check if provenance attestation is set in attests input
  let hasAttestProvenance = false;
  await Util.asyncForEach(inputs.attests, async (attest: string) => {
    if (Build.hasAttestationType('provenance', attest)) {
      hasAttestProvenance = true;
    }
  });

  let provenanceSet = false;
  let sbomSet = false;
  if (inputs.provenance) {
    args.push('--attest', Build.resolveAttestationAttrs(`type=provenance,${inputs.provenance}`));
    provenanceSet = true;
  } else if (!hasAttestProvenance && (await toolkit.buildkit.versionSatisfies(inputs.builder, '>=0.11.0')) && !Build.hasDockerExporter(inputs.outputs, inputs.load)) {
    // if provenance not specified in provenance or attests inputs and BuildKit
    // version compatible for attestation, set default provenance. Also needs
    // to make sure user doesn't want to explicitly load the image to docker.
    if (GitHub.context.payload.repository?.private ?? false) {
      // if this is a private repository, we set the default provenance
      // attributes being set in buildx: https://github.com/docker/buildx/blob/fb27e3f919dcbf614d7126b10c2bc2d0b1927eb6/build/build.go#L603
      args.push('--attest', `type=provenance,${Build.resolveProvenanceAttrs(`mode=min,inline-only=true`)}`);
    } else {
      // for a public repository, we set max provenance mode.
      args.push('--attest', `type=provenance,${Build.resolveProvenanceAttrs(`mode=max`)}`);
    }
  }
  if (inputs.sbom) {
    args.push('--attest', Build.resolveAttestationAttrs(`type=sbom,${inputs.sbom}`));
    sbomSet = true;
  }

  // set attests but check if provenance or sbom types already set as
  // provenance and sbom inputs take precedence over attests input.
  await Util.asyncForEach(inputs.attests, async (attest: string) => {
    if (!Build.hasAttestationType('provenance', attest) && !Build.hasAttestationType('sbom', attest)) {
      args.push('--attest', Build.resolveAttestationAttrs(attest));
    } else if (!provenanceSet && Build.hasAttestationType('provenance', attest)) {
      args.push('--attest', Build.resolveProvenanceAttrs(attest));
    } else if (!sbomSet && Build.hasAttestationType('sbom', attest)) {
      args.push('--attest', attest);
    }
  });

  return args;
}
