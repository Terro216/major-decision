FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
USER root
RUN apt-get update -qq \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends pulseaudio squid curl git ca-certificates libicu74 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /runner
RUN curl --fail --location --silent --show-error https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-linux-x64-2.338.0.tar.gz --output /tmp/runner.tar.gz \
    && echo 'af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32  /tmp/runner.tar.gz' | sha256sum -c - \
    && tar -xzf /tmp/runner.tar.gz -C /runner \
    && rm /tmp/runner.tar.gz \
    && chown -R pwuser:pwuser /runner
COPY runner.py /usr/local/bin/major-decision-runner
COPY job-complete.sh /usr/local/bin/major-decision-job-complete.sh
COPY squid.conf /etc/major-decision-squid.conf
RUN chmod 0755 /usr/local/bin/major-decision-runner /usr/local/bin/major-decision-job-complete.sh
USER pwuser
ENV ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/usr/local/bin/major-decision-job-complete.sh \
    MD_EXECUTION_HOST=big-one NODE_OPTIONS=--max-old-space-size=768
ENTRYPOINT ["/usr/local/bin/major-decision-runner"]
