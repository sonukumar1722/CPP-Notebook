# Steps to run the application:

## Prerequisites:
- Make sure `Miniconda` is installed on WSL Ubuntu. (https://docs.conda.io/en/latest/miniconda.html) Or it can be installed using `conda install miniconda` command.
- Make sure `WSL Ubuntu` is installed on Windows via `wsl --install -d ubuntu` command. (https://docs.microsoft.com/en-us/windows/wsl/install-win32)    
- Make sure Docker Desktop is running on WSL Ubuntu. (https://www.docker.com/products/docker-desktop/) and enable `WSL Integration` in Docker Desktop settings.

## Open Terminal:
- Open `Terminal`.
- `wsl -d ubuntu` to open the WSL ubuntu terminal.
- `conda activate cling_env` to activate the conda virtual environment.
- `cd backend` to navigate to the `backend` directory.

## Backend steps:
- `pip install -r requirements.txt` to install dependencies if not already installed.
- `python app/db/init_db.py` to create database tables.
- `uvicorn app.main:app --reload` to start the FastAPI server.

## Postgres steps:
- `docker-compose up -d postgres` to start the PostgreSQL server.

## Frontend steps:
- `npm run dev` to start the Vite server.
- Open `http://localhost:5173` in your browser to see the application.