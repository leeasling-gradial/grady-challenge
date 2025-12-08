#!/usr/bin/env node

import { Command } from "commander";
import { GitHubClient } from "./github-client.js";
import * as fs from "fs";
import * as path from "path";

const program = new Command();

function getClient(): GitHubClient {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || "leeasling-gradial";
  const repo = process.env.GITHUB_REPO || "grady-challenge";

  if (!token) {
    console.error("Error: GITHUB_TOKEN environment variable is required");
    console.error("Set it with: export GITHUB_TOKEN=your_token");
    process.exit(1);
  }

  return new GitHubClient(token, owner, repo);
}

program
  .name("content-manager")
  .description("CLI to checkout, update, and checkin files to GitHub Pages")
  .version("1.0.0");

program
  .command("checkout <file>")
  .description("Checkout a file from the repository")
  .option("-b, --branch <branch>", "Branch to checkout from", "main")
  .option("-o, --output <path>", "Local path to save the file")
  .action(async (file: string, options: { branch: string; output?: string }) => {
    const client = getClient();

    try {
      console.log(`Checking out: ${file}`);
      const result = await client.checkout(file, options.branch);

      const outputPath = options.output || path.basename(file);
      fs.writeFileSync(outputPath, result.content);

      // Save metadata for later checkin
      const metaPath = `${outputPath}.meta.json`;
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            path: result.path,
            sha: result.sha,
            branch: options.branch,
            checkedOutAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      console.log(`✓ File saved to: ${outputPath}`);
      console.log(`✓ Metadata saved to: ${metaPath}`);
      console.log(`  SHA: ${result.sha}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command("checkin <file>")
  .description("Check in a modified file to the repository")
  .option("-m, --message <message>", "Commit message", "Update content")
  .option("-b, --branch <branch>", "Branch to commit to")
  .action(async (file: string, options: { message: string; branch?: string }) => {
    const client = getClient();

    try {
      // Read the local file
      if (!fs.existsSync(file)) {
        throw new Error(`Local file not found: ${file}`);
      }
      const content = fs.readFileSync(file, "utf-8");

      // Read metadata
      const metaPath = `${file}.meta.json`;
      if (!fs.existsSync(metaPath)) {
        throw new Error(
          `Metadata file not found: ${metaPath}\nDid you checkout this file first?`
        );
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

      const branch = options.branch || meta.branch || "main";

      console.log(`Checking in: ${meta.path}`);
      const result = await client.checkin(
        meta.path,
        content,
        options.message,
        meta.sha,
        branch
      );

      // Update metadata with new SHA
      meta.sha = result.sha;
      meta.lastCommit = result.url;
      meta.lastUpdatedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

      console.log(`✓ File committed successfully`);
      console.log(`  Commit: ${result.sha.substring(0, 7)}`);
      console.log(`  URL: ${result.url}`);
      console.log(`\n✓ GitHub Pages will update shortly`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command("update <file>")
  .description("Checkout, apply updates, and checkin in one command")
  .option("-b, --branch <branch>", "Branch to use", "main")
  .option("-m, --message <message>", "Commit message", "Update content")
  .option("--find <text>", "Text to find")
  .option("--replace <text>", "Text to replace with")
  .option("--append <text>", "Text to append")
  .option("--prepend <text>", "Text to prepend")
  .action(
    async (
      file: string,
      options: {
        branch: string;
        message: string;
        find?: string;
        replace?: string;
        append?: string;
        prepend?: string;
      }
    ) => {
      const client = getClient();

      try {
        // Checkout
        console.log(`Checking out: ${file}`);
        const result = await client.checkout(file, options.branch);
        let content = result.content;

        // Apply transformations
        let modified = false;

        if (options.find && options.replace !== undefined) {
          const newContent = content.split(options.find).join(options.replace);
          if (newContent !== content) {
            content = newContent;
            modified = true;
            console.log(`✓ Replaced "${options.find}" with "${options.replace}"`);
          } else {
            console.log(`⚠ Text "${options.find}" not found in file`);
          }
        }

        if (options.append) {
          content = content + options.append;
          modified = true;
          console.log(`✓ Appended content`);
        }

        if (options.prepend) {
          content = options.prepend + content;
          modified = true;
          console.log(`✓ Prepended content`);
        }

        if (!modified) {
          console.log("No modifications made. Skipping checkin.");
          return;
        }

        // Checkin
        console.log(`Checking in: ${file}`);
        const commitResult = await client.checkin(
          file,
          content,
          options.message,
          result.sha,
          options.branch
        );

        console.log(`✓ File committed successfully`);
        console.log(`  Commit: ${commitResult.sha.substring(0, 7)}`);
        console.log(`  URL: ${commitResult.url}`);
        console.log(`\n✓ GitHub Pages will update shortly`);
      } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    }
  );

program
  .command("list [directory]")
  .description("List files in the repository")
  .option("-b, --branch <branch>", "Branch to list from", "main")
  .action(async (directory: string = "", options: { branch: string }) => {
    const client = getClient();

    try {
      const files = await client.listFiles(directory, options.branch);
      console.log(`Files in ${directory || "root"}:`);
      files.forEach((file) => console.log(`  ${file}`));
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command("info")
  .description("Show repository information")
  .action(async () => {
    const client = getClient();

    try {
      const info = await client.getRepoInfo();
      console.log(`Repository: ${info.owner}/${info.repo}`);
      console.log(`Default branch: ${info.defaultBranch}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
