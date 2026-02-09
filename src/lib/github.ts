import { Octokit } from "@octokit/rest";
import { db } from "./db";

/**
 * Retrieve the GitHub OAuth access_token for a user from the Account table.
 * NextAuth's PrismaAdapter stores this when the user signs in with GitHub.
 */
export async function getGitHubToken(userId: string): Promise<string> {
  const account = await db.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });

  if (!account?.access_token) {
    throw new Error("GitHub access token not found. Please re-authenticate.");
  }

  return account.access_token;
}

export function createOctokit(accessToken: string) {
  return new Octokit({ auth: accessToken });
}

export async function getUserRepos(accessToken: string) {
  const octokit = createOctokit(accessToken);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
    type: "owner",
  });
  return data;
}

export async function getRepo(
  accessToken: string,
  owner: string,
  repo: string
) {
  const octokit = createOctokit(accessToken);
  const { data } = await octokit.repos.get({ owner, repo });
  return data;
}

export async function createOrUpdateFile(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string
) {
  const octokit = createOctokit(accessToken);
  return octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    sha,
  });
}
