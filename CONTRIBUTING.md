# Contributing to FlowTrack

Thanks for your interest in contributing! This is a personal portfolio project, but issues and pull requests are welcome.

## Getting Started

1. Fork the repository
2. Set up the development environment following [README.md](README.md#getting-started)
3. Create a feature branch: `git checkout -b feat/your-feature`
4. Make your changes and ensure all checks pass
5. Open a pull request against `main`

## Development Setup

```bash
# Backend (Python 3.11+)
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # fill in your values

# Frontend (Node 18+)
cd frontend
npm install
cp .env.example .env.local    # fill in your values
npm run dev
```

## Code Standards

- **TypeScript**: strict mode, zero ESLint warnings (`npm run lint`)
- **Python**: type hints required, passes `ruff` check
- **Tests**: new backend features should include integration tests (`pytest`)
- **Commits**: use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)

## Running Tests

```bash
# Backend
cd backend
pytest

# Frontend type check
cd frontend
npm run typecheck
```

## What Not to Contribute

- New dependencies without prior discussion
- Changes to the core tech stack (see [architecture.md](docs/architecture.md) for rationale)
- UI framework migrations (React, Zustand, custom CSS are intentional choices)

## Questions

Open an issue or reach out via email listed in the [Security Policy](SECURITY.md).
