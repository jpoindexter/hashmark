import { Octokit } from "@octokit/rest";

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
