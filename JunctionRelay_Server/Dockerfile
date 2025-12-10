# Stage 1: Build the React App (Frontend)
FROM node:18 AS build-frontend
WORKDIR /app
# Copy all frontend source files first (including scripts directory)
COPY junctionrelaywebui/ ./junctionrelaywebui/
# Install dependencies for React
RUN npm install --prefix ./junctionrelaywebui
# Build the React app (production build)
RUN npm run build --prefix ./junctionrelaywebui

# Stage 2: Runtime Image (Use Pre-Built Files)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
ARG VERSION=dev
ARG RUNTIME=linux-x64

# Metadata labels
LABEL org.opencontainers.image.title="JunctionRelay"
LABEL org.opencontainers.image.version=${VERSION}
LABEL org.opencontainers.image.description="JunctionRelay Backend Server with integrated React UI"
LABEL org.opencontainers.image.source="https://github.com/catapultcase/JunctionRelay"

# Install required packages for SerialPortStream and Chrome dependencies
RUN apt-get update && apt-get install -y \
    git \
    cmake \
    build-essential \
    libudev1 \
    libfontconfig1 \
    libfreetype6 \
    libgl1-mesa-dev \
    libglu1-mesa-dev \
    mesa-utils \
    uuid-dev \
    libuuid1 \
    wget \
    gnupg2 \
    apt-transport-https \
    ca-certificates \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgtk-3-0 \
    libxss1 \
    libasound2 \
    libxrandr2 \
    libatk1.0-0 \
    libx11-xcb1 \
    libxcb1 \
    libxcb-dri3-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libgconf-2-4 \
    libappindicator3-1 \
    fonts-liberation \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome/Chromium based on architecture
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
        # AMD64: Install Google Chrome
        wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
        echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
        apt-get update && \
        apt-get install -y google-chrome-stable && \
        rm -rf /var/lib/apt/lists/*; \
    else \
        # ARM64: Install Chromium (Google Chrome not available for ARM64)
        apt-get update && \
        apt-get install -y chromium chromium-driver && \
        rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /tmp
# Clone the SerialPortStream repository
RUN git clone https://github.com/jcurl/RJCP.DLL.SerialPortStream.git

# Build and install the native library
RUN cd RJCP.DLL.SerialPortStream/dll/serialunix \
    && cmake . \
    && make \
    && make install

# Update the dynamic linker cache
RUN ldconfig

WORKDIR /app

# Copy the pre-built publish folder with correct architecture mapping
ARG TARGETARCH
RUN echo "Building for Docker architecture: $TARGETARCH"

# Map Docker architecture to .NET RID
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        echo "linux-arm64" > /tmp/rid; \
    elif [ "$TARGETARCH" = "amd64" ]; then \
        echo "linux-x64" > /tmp/rid; \
    else \
        echo "Unknown architecture: $TARGETARCH"; exit 1; \
    fi

RUN DOTNET_RID=$(cat /tmp/rid) && echo "Using .NET RID: $DOTNET_RID"

# Copy the correct architecture files
COPY bin/Release/net8.0/ /tmp/build/
RUN DOTNET_RID=$(cat /tmp/rid) && \
    if [ -d "/tmp/build/$DOTNET_RID/publish" ]; then \
        cp -r "/tmp/build/$DOTNET_RID/publish/"* /app/; \
        echo "Copied from $DOTNET_RID folder"; \
        ls -la /app/ | head -10; \
    else \
        echo "ERROR: Folder /tmp/build/$DOTNET_RID/publish not found!"; \
        ls -la /tmp/build/; \
        exit 1; \
    fi

# Copy the React build output into `wwwroot`
COPY --from=build-frontend /app/junctionrelaywebui/build /app/wwwroot

# Create entrypoint script with Chrome and library path fixes
RUN echo '#!/bin/bash' > /app/entrypoint.sh && \
    echo 'set -e' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Determine architecture and apply appropriate fixes' >> /app/entrypoint.sh && \
    echo 'ARCH=$(uname -m)' >> /app/entrypoint.sh && \
    echo 'if [ "$ARCH" = "aarch64" ]; then' >> /app/entrypoint.sh && \
    echo '    # ARM64 library fixes' >> /app/entrypoint.sh && \
    echo '    export LD_PRELOAD="/usr/lib/aarch64-linux-gnu/libuuid.so.1:/usr/lib/aarch64-linux-gnu/libfreetype.so.6"' >> /app/entrypoint.sh && \
    echo '    export LD_LIBRARY_PATH="/usr/local/lib:/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu"' >> /app/entrypoint.sh && \
    echo '    echo "ARM64 library fixes applied - LD_PRELOAD: $LD_PRELOAD"' >> /app/entrypoint.sh && \
    echo '    echo "ARM64 library fixes applied - LD_LIBRARY_PATH: $LD_LIBRARY_PATH"' >> /app/entrypoint.sh && \
    echo '    # ARM64 uses Chromium' >> /app/entrypoint.sh && \
    echo '    export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium' >> /app/entrypoint.sh && \
    echo '    export CHROME_BIN=/usr/bin/chromium' >> /app/entrypoint.sh && \
    echo 'elif [ "$ARCH" = "x86_64" ]; then' >> /app/entrypoint.sh && \
    echo '    # x64 library path' >> /app/entrypoint.sh && \
    echo '    export LD_LIBRARY_PATH="/usr/local/lib:/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu"' >> /app/entrypoint.sh && \
    echo '    echo "x64 detected - LD_LIBRARY_PATH: $LD_LIBRARY_PATH"' >> /app/entrypoint.sh && \
    echo '    # x64 uses Google Chrome' >> /app/entrypoint.sh && \
    echo '    export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome' >> /app/entrypoint.sh && \
    echo '    export CHROME_BIN=/usr/bin/google-chrome' >> /app/entrypoint.sh && \
    echo 'else' >> /app/entrypoint.sh && \
    echo '    echo "Unknown architecture: $ARCH"' >> /app/entrypoint.sh && \
    echo '    export LD_LIBRARY_PATH="/usr/local/lib"' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Chrome/Puppeteer environment variables' >> /app/entrypoint.sh && \
    echo 'export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' >> /app/entrypoint.sh && \
    echo 'export DISPLAY=:99' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Verify Chrome/Chromium installation' >> /app/entrypoint.sh && \
    echo 'if [ "$ARCH" = "aarch64" ] && [ -f "/usr/bin/chromium" ]; then' >> /app/entrypoint.sh && \
    echo '    echo "Chromium found for ARM64 at /usr/bin/chromium"' >> /app/entrypoint.sh && \
    echo '    /usr/bin/chromium --version' >> /app/entrypoint.sh && \
    echo 'elif [ "$ARCH" = "x86_64" ] && [ -f "/usr/bin/google-chrome" ]; then' >> /app/entrypoint.sh && \
    echo '    echo "Google Chrome found for x64 at /usr/bin/google-chrome"' >> /app/entrypoint.sh && \
    echo '    /usr/bin/google-chrome --version' >> /app/entrypoint.sh && \
    echo 'else' >> /app/entrypoint.sh && \
    echo '    echo "WARNING: Chrome/Chromium not found for architecture $ARCH"' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    echo '' >> /app/entrypoint.sh && \
    echo '# Run the application' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Ensure the SQLite database directory exists
RUN mkdir -p /app/data

# Set environment variable for the database path
ENV DB_PATH=/app/data/jr_database.db

# Chrome/Puppeteer environment variables (defaults, will be overridden at runtime)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Listen on port 7180
ENV ASPNETCORE_URLS=http://+:7180
EXPOSE 7180

# Allow USB passthrough for serial ports
VOLUME ["/dev"]

# Entry point with Chrome and library fixes
ENTRYPOINT ["/app/entrypoint.sh", "dotnet", "JunctionRelay_Server.dll"]