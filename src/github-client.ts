import { Octokit } from "@octokit/rest";

export interface FileContent {
  content: string;
  sha: string;
  path: string;
  encoding: string;
}

export interface CommitResult {
  sha: string;
  url: string;
  message: string;
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Checkout (fetch) a file from the repository
   */
  async checkout(path: string, branch: string = "main"): Promise<FileContent> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: branch,
      });

      const data = response.data;

      if (Array.isArray(data)) {
        throw new Error(`Path "${path}" is a directory, not a file`);
      }

      if (data.type !== "file") {
        throw new Error(`Path "${path}" is not a file (type: ${data.type})`);
      }

      if (!("content" in data) || !data.content) {
        throw new Error(`No content found for file "${path}"`);
      }

      const content = Buffer.from(data.content, "base64").toString("utf-8");

      return {
        content,
        sha: data.sha,
        path: data.path,
        encoding: data.encoding || "base64",
      };
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Check in (commit) updated content to the repository
   */
  async checkin(
    path: string,
    content: string,
    message: string,
    sha: string,
    branch: string = "main"
  ): Promise<CommitResult> {
    const encodedContent = Buffer.from(content).toString("base64");

    const response = await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: encodedContent,
      sha,
      branch,
    });

    return {
      sha: response.data.commit.sha || "",
      url: response.data.commit.html_url || "",
      message: response.data.commit.message || message,
    };
  }

  /**
   * Create a new file in the repository
   */
  async createFile(
    path: string,
    content: string,
    message: string,
    branch: string = "main"
  ): Promise<CommitResult> {
    const encodedContent = Buffer.from(content).toString("base64");

    const response = await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: encodedContent,
      branch,
    });

    return {
      sha: response.data.commit.sha || "",
      url: response.data.commit.html_url || "",
      message: response.data.commit.message || message,
    };
  }

  /**
   * List files in a directory
   */
  async listFiles(path: string = "", branch: string = "main"): Promise<string[]> {
    const response = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: branch,
    });

    const data = response.data;

    if (!Array.isArray(data)) {
      return [data.path];
    }

    return data
      .filter((item) => item.type === "file")
      .map((item) => item.path);
  }

  /**
   * Get repository info
   */
  async getRepoInfo(): Promise<{ owner: string; repo: string; defaultBranch: string }> {
    const response = await this.octokit.repos.get({
      owner: this.owner,
      repo: this.repo,
    });

    return {
      owner: this.owner,
      repo: this.repo,
      defaultBranch: response.data.default_branch,
    };
  }
}
