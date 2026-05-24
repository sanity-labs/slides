import pc from 'picocolors';

const PKG = 'react-pptx-dev';
export const formatBanner = (templateName: string, startedInMs: number): string => {
  const title = pc.bold(pc.magenta('slides-dev'));
  const tmpl = pc.dim('•') + ' ' + pc.cyan(templateName);
  const took = pc.dim(`ready in ${startedInMs}ms`);
  return `\n  ${title}  ${tmpl}  ${took}\n`;
};
export const formatReady = (params: {
  url: string;
  templatePath: string;
  host: boolean;
}): string => {
  const arrow = pc.green('➜');
  const lines: string[] = [];
  lines.push(`  ${arrow}  ${pc.bold('Local:')}    ${pc.cyan(params.url)}`);
  if (!params.host) {
    lines.push(`  ${arrow}  ${pc.bold('Network:')}  ${pc.dim('use --host to expose')}`);
  }
  lines.push(`  ${arrow}  ${pc.bold('Template:')} ${pc.dim(params.templatePath)}`);
  return lines.join('\n') + '\n';
};
const stripResolverPrefix = (message: string) => message.replace(/^slides-dev:\s*/, '');

export const formatStartupError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  return [
    '',
    `  ${pc.red(pc.bold('Failed to start slides-dev'))}`,
    '',
    `  ${stripResolverPrefix(message)}`,
    '',
    `  ${pc.dim(`See ${PKG} --help for usage.`)}`,
    '',
  ].join('\n');
};
