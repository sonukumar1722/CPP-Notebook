FROM mambaorg/micromamba:latest

USER root
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MAMBA_DOCKERFILE_ACTIVATE=1

SHELL ["/usr/local/bin/_dockerfile_shell.sh"]

COPY requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/opt/conda/pkgs \
    micromamba install -y -n base -c conda-forge python=3.12 xeus-cling && \
    python -m pip install --no-cache-dir -r /tmp/requirements.txt && \
    micromamba clean --all --yes

COPY . /app

EXPOSE 8000

CMD ["bash", "-lc", "uvicorn app.main:app --host 0.0.0.0 --port 8000"]
