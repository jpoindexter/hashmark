import { describe, it, expect } from "vitest";
import { extractAllExports, extractExportedSymbols } from "../extract-exports.js";

// ============================================================================
// Named exports
// ============================================================================

describe("extractAllExports", () => {
  it("extracts exported functions", () => {
    const content = `
export function hello() {}
export async function fetchData() {}
    `;
    expect(extractAllExports(content)).toEqual(["hello", "fetchData"]);
  });

  it("extracts exported classes", () => {
    const content = `
export class MyService {}
export abstract class BaseHandler {}
    `;
    expect(extractAllExports(content)).toEqual(["MyService", "BaseHandler"]);
  });

  it("extracts exported constants", () => {
    const content = `
export const MAX_SIZE = 100;
export let counter = 0;
export var legacy = true;
    `;
    expect(extractAllExports(content)).toEqual(["MAX_SIZE", "counter", "legacy"]);
  });

  it("extracts exported types and interfaces", () => {
    const content = `
export type UserId = string;
export interface Config {
  port: number;
}
export type Props = {
  name: string;
};
    `;
    const exports = extractAllExports(content);
    expect(exports).toContain("UserId");
    expect(exports).toContain("Config");
    expect(exports).toContain("Props");
  });

  it("extracts exported enums", () => {
    const content = `
export enum Status {
  Active = "active",
  Inactive = "inactive",
}
    `;
    expect(extractAllExports(content)).toEqual(["Status"]);
  });

  it("extracts default function exports", () => {
    const content = `
export default function HomePage() {
  return <div />;
}
    `;
    expect(extractAllExports(content)).toEqual(["HomePage"]);
  });

  it("extracts default class exports", () => {
    const content = `
export default class ApiClient {}
    `;
    expect(extractAllExports(content)).toEqual(["ApiClient"]);
  });

  it("extracts named re-exports (without from clause)", () => {
    const content = `
const foo = 1;
const bar = 2;
export { foo, bar };
    `;
    expect(extractAllExports(content)).toEqual(["foo", "bar"]);
  });

  it("handles 'as' renames in named exports", () => {
    const content = `
const internal = 1;
export { internal as publicName };
    `;
    expect(extractAllExports(content)).toEqual(["publicName"]);
  });

  it("skips re-exports with from clause", () => {
    const content = `
export { something } from "./other.js";
export function localFunc() {}
    `;
    const exports = extractAllExports(content);
    expect(exports).toEqual(["localFunc"]);
  });

  it("deduplicates exports", () => {
    const content = `
export function foo() {}
export { foo };
    `;
    expect(extractAllExports(content)).toEqual(["foo"]);
  });

  it("ignores exports inside comments", () => {
    const content = `
// export function notReal() {}
/* export const ignored = true; */
export function real() {}
    `;
    expect(extractAllExports(content)).toEqual(["real"]);
  });

  it("ignores exports inside template literals", () => {
    const content = `
const template = \`export function fake() {}\`;
export function real() {}
    `;
    expect(extractAllExports(content)).toEqual(["real"]);
  });

  it("handles mixed export types", () => {
    const content = `
export function scanImports() {}
export const MAX_DEPTH = 10;
export type ScanResult = { files: string[] };
export interface Config { port: number; }
export enum Mode { Dev, Prod }
export class Scanner {}
    `;
    const exports = extractAllExports(content);
    expect(exports).toContain("scanImports");
    expect(exports).toContain("MAX_DEPTH");
    expect(exports).toContain("ScanResult");
    expect(exports).toContain("Config");
    expect(exports).toContain("Mode");
    expect(exports).toContain("Scanner");
    expect(exports).toHaveLength(6);
  });

  it("returns empty array for files with no exports", () => {
    const content = `
function internal() {}
const value = 42;
    `;
    expect(extractAllExports(content)).toEqual([]);
  });

  it("extracts generator function exports", () => {
    const content = `
export function* generateIds() {}
export async function* streamData() {}
    `;
    const exports = extractAllExports(content);
    expect(exports).toContain("generateIds");
    expect(exports).toContain("streamData");
  });
});

// ============================================================================
// Multi-language support
// ============================================================================

describe("extractExportedSymbols — Python", () => {
  it("extracts top-level Python functions", () => {
    const content = `
def hello():
    pass

def process_data(items):
    return [i for i in items]

class MyClass:
    def method(self):
        pass
    `;
    const symbols = extractExportedSymbols(content);
    const names = symbols.map(s => s.name);
    expect(names).toContain("hello");
    expect(names).toContain("process_data");
    // method should NOT be included (indented)
    expect(names).not.toContain("method");
  });

  it("extracts top-level Python classes", () => {
    const content = `
class Service:
    pass

class Handler(BaseHandler):
    pass
    `;
    const symbols = extractExportedSymbols(content);
    const names = symbols.map(s => s.name);
    expect(names).toContain("Service");
    expect(names).toContain("Handler");
  });
});

describe("extractExportedSymbols — Go", () => {
  it("extracts exported Go functions (PascalCase)", () => {
    const content = `
func HandleRequest(w http.ResponseWriter, r *http.Request) {}
func (s *Server) Start() error {}
func privateHelper() {}
    `;
    const symbols = extractExportedSymbols(content);
    const names = symbols.map(s => s.name);
    expect(names).toContain("HandleRequest");
    expect(names).toContain("Start");
    // lowercase = unexported in Go
    expect(names).not.toContain("privateHelper");
  });
});

describe("extractExportedSymbols — Rust", () => {
  it("extracts pub items", () => {
    const content = `
pub fn process(data: &[u8]) -> Result<()> {}
pub async fn fetch_data() -> String {}
pub struct Config { port: u16 }
pub enum Status { Active, Inactive }
pub trait Handler { fn handle(&self); }
fn private_fn() {}
    `;
    const symbols = extractExportedSymbols(content);
    const names = symbols.map(s => s.name);
    expect(names).toContain("process");
    expect(names).toContain("fetch_data");
    expect(names).toContain("Config");
    expect(names).toContain("Status");
    expect(names).toContain("Handler");
    expect(names).not.toContain("private_fn");
  });
});

// ============================================================================
// Symbol kinds
// ============================================================================

describe("extractExportedSymbols — kinds", () => {
  it("tags symbols with correct kinds", () => {
    const content = `
export function myFunc() {}
export class MyClass {}
export const MY_CONST = 1;
export type MyType = string;
export interface MyInterface {}
export enum MyEnum {}
export default function DefaultFunc() {}
    `;
    const symbols = extractExportedSymbols(content);
    const byName = new Map(symbols.map(s => [s.name, s.kind]));

    expect(byName.get("myFunc")).toBe("function");
    expect(byName.get("MyClass")).toBe("class");
    expect(byName.get("MY_CONST")).toBe("const");
    expect(byName.get("MyType")).toBe("type");
    expect(byName.get("MyInterface")).toBe("interface");
    expect(byName.get("MyEnum")).toBe("enum");
    expect(byName.get("DefaultFunc")).toBe("default");
  });
});
