"use strict";
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");
for (const dir of ["extension", "tests", "scripts"]) {
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".js")) execFileSync(process.execPath, ["--check", join(dir, file)], { stdio: "inherit" });
  }
}
