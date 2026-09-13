import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { runPipeline } from "./pipeline.js";
import type { BatchCase, BatchKitEntry, BatchOutput } from "./types.js";
import { PipelineError } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });
config();

function isPathArg(value?: string): value is string {
  return Boolean(value && value !== "true" && value !== "false");
}

function argValue(flag: "--input" | "--output", position: number): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && isPathArg(process.argv[index + 1])) return process.argv[index + 1];
  const fromNpm = process.env[`npm_config_${flag.slice(2)}`];
  if (isPathArg(fromNpm)) return fromNpm;
  const positionals = process.argv.slice(2).filter((arg) => isPathArg(arg) && !arg.startsWith("--"));
  return positionals[position];
}

function toError(error: unknown): { code: string; message: string } {
  if (error instanceof PipelineError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    if (/ENOTFOUND|ECONNREFUSED|timeout|unreachable/i.test(error.message)) {
      return { code: "COMPANY_UNREACHABLE", message: error.message };
    }
    return { code: "PIPELINE_FAILED", message: error.message };
  }
  return { code: "PIPELINE_FAILED", message: String(error) };
}

async function runCase(item: BatchCase): Promise<BatchKitEntry> {
  try {
    const result = await runPipeline({
      jd: item.jd,
      company_url: item.company_url,
      days: item.days,
      allowPrivateUrls: true,
    });
    return { id: item.id, status: "ok", kit: result.kit, error: null };
  } catch (error) {
    return { id: item.id, status: "failed", kit: null, error: toError(error) };
  }
}

export async function evaluateFile(inputPath: string, outputPath: string): Promise<BatchOutput> {
  const raw = await readFile(inputPath, "utf8");
  const cases = JSON.parse(raw) as BatchCase[];
  if (!Array.isArray(cases)) {
    throw new Error("Input file must be an array of cases.");
  }

  const kits: BatchKitEntry[] = [];
  for (const item of cases) {
    kits.push(await runCase(item));
  }

  const output: BatchOutput = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits,
  };

  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  return output;
}

const cliInput = argValue("--input", 0);
const cliOutput = argValue("--output", 1);

if (cliInput && cliOutput) {
  evaluateFile(resolve(cliInput), resolve(cliOutput))
    .then((result) => {
      const failed = result.kits.filter((k) => k.status === "failed").length;
      console.log(`Wrote ${result.kits.length} kits (${failed} failed) to ${cliOutput}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
} else if (process.argv[1] && /evaluate\.(ts|js)/.test(process.argv[1])) {
  console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  process.exit(1);
}
