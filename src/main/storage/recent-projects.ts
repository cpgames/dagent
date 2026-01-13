import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'

/**
 * Recent project entry stored in user data directory.
 */
export interface RecentProject {
  path: string
  name: string
  lastOpened: string
}

const MAX_RECENT_PROJECTS = 10

/**
 * Get the path to recent-projects.json in user data directory.
 */
function getRecentProjectsPath(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json')
}

/**
 * Read recent projects from storage.
 * Returns empty array if file doesn't exist.
 */
export async function getRecentProjects(): Promise<RecentProject[]> {
  try {
    const filePath = getRecentProjectsPath()
    const data = await readFile(filePath, 'utf-8')
    return JSON.parse(data) as RecentProject[]
  } catch {
    // File doesn't exist or is invalid - return empty list
    return []
  }
}

/**
 * Save recent projects to storage.
 */
async function saveRecentProjects(projects: RecentProject[]): Promise<void> {
  const filePath = getRecentProjectsPath()
  const dir = path.dirname(filePath)
  await mkdir(dir, { recursive: true })
  await writeFile(filePath, JSON.stringify(projects, null, 2), 'utf-8')
}

/**
 * Add a project to the recent projects list.
 * Moves existing entry to front if already present.
 * Limits to MAX_RECENT_PROJECTS entries.
 */
export async function addRecentProject(projectPath: string, name: string): Promise<void> {
  const projects = await getRecentProjects()

  // Remove existing entry with same path (case-insensitive on Windows)
  const filteredProjects = projects.filter(
    (p) => p.path.toLowerCase() !== projectPath.toLowerCase()
  )

  // Add new entry at front
  const newProject: RecentProject = {
    path: projectPath,
    name,
    lastOpened: new Date().toISOString()
  }

  const updatedProjects = [newProject, ...filteredProjects].slice(0, MAX_RECENT_PROJECTS)

  await saveRecentProjects(updatedProjects)
}

/**
 * Remove a project from the recent projects list.
 */
export async function removeRecentProject(projectPath: string): Promise<void> {
  const projects = await getRecentProjects()

  const filteredProjects = projects.filter(
    (p) => p.path.toLowerCase() !== projectPath.toLowerCase()
  )

  await saveRecentProjects(filteredProjects)
}

/**
 * Clear all recent projects.
 */
export async function clearRecentProjects(): Promise<void> {
  await saveRecentProjects([])
}
