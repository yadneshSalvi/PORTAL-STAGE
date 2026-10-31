# PORTAL STAGE

A shared live theater for remote creators and their Twitch communities: performers exchange persistent virtual props while viewers help direct the show.

**Status:** planning and repository setup. No runnable application or deployed service is included yet.

## Local planning

The detailed implementation, design, judging, and demonstration plans are in `plans/00-index.md` on the original development machine. The entire `plans/` directory is intentionally Git-ignored and is not available in a fresh clone.

## Local configuration

An ignored `.env` has been initialized on the original development machine from the existing hackathon configuration. `.env.example` contains names and empty placeholders only. Provider keys, room-signing secrets, and Twitch tokens must remain server-side.

The copied Twitch credentials are a shared bootstrap configuration, not independent production authorization. Token freshness, project-specific callbacks, and separate production token storage must be verified during implementation. Live media infrastructure is planned but has not been provisioned. A fresh clone needs its own local environment configuration.

## Submission preparation

The repository starts private. Before submission, provide judges the source and free runnable access required by the official rules. Add installation instructions, validation results, asset credits, participant consent requirements, and the actual main development Codex session ID as the implementation is completed. Do not commit credentials, private recordings, or private chat logs.
