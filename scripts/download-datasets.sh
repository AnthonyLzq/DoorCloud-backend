#!/bin/bash

# Download face recognition benchmark datasets
# LFW, CFP-FP, and AgeDB-30

set -e  # Exit on error

DATASETS_DIR="datasets"
TEMP_DIR="$DATASETS_DIR/temp"

echo "Creating datasets directory..."
mkdir -p "$DATASETS_DIR"
mkdir -p "$TEMP_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Download LFW dataset
download_lfw() {
    log_info "Downloading LFW dataset (Labeled Faces in the Wild)..."

    LFW_URL="http://vis-www.cs.umass.edu/lfw/lfw.tgz"
    LFW_FILE="$TEMP_DIR/lfw.tgz"
    LFW_DIR="$DATASETS_DIR/lfw"

    if [ -d "$LFW_DIR" ]; then
        log_warn "LFW dataset already exists, skipping download"
        return 0
    fi

    # Download
    if command -v curl &> /dev/null; then
        curl -L -o "$LFW_FILE" "$LFW_URL"
    elif command -v wget &> /dev/null; then
        wget -O "$LFW_FILE" "$LFW_URL"
    else
        log_error "Neither curl nor wget found. Please install one of them."
        return 1
    fi

    # Extract
    log_info "Extracting LFW dataset..."
    tar -xzf "$LFW_FILE" -C "$DATASETS_DIR"

    # Rename to lfw
    if [ -d "$DATASETS_DIR/lfw" ]; then
        log_info "LFW dataset extracted successfully"
    else
        log_error "Failed to extract LFW dataset"
        return 1
    fi

    # Download pairs.txt for verification
    log_info "Downloading LFW pairs.txt..."
    PAIRS_URL="http://vis-www.cs.umass.edu/lfw/pairs.txt"
    curl -L -o "$LFW_DIR/pairs.txt" "$PAIRS_URL"

    # Cleanup
    rm -f "$LFW_FILE"

    log_info "LFW dataset downloaded and validated"
}

# Download CFP-FP dataset
download_cfp_fp() {
    log_info "Downloading CFP-FP dataset (Celebrities Frontal-Profile)..."

    # CFP-FP is available from the official website
    CFP_URL="http://www.cfpw.io/datasets/CFP-FP.zip"
    CFP_FILE="$TEMP_DIR/CFP-FP.zip"
    CFP_DIR="$DATASETS_DIR/cfp-fp"

    if [ -d "$CFP_DIR" ]; then
        log_warn "CFP-FP dataset already exists, skipping download"
        return 0
    fi

    # Download
    if command -v curl &> /dev/null; then
        curl -L -o "$CFP_FILE" "$CFP_URL"
    elif command -v wget &> /dev/null; then
        wget -O "$CFP_FILE" "$CFP_URL"
    else
        log_error "Neither curl nor wget found. Please install one of them."
        return 1
    fi

    # Extract
    log_info "Extracting CFP-FP dataset..."
    unzip -q "$CFP_FILE" -d "$DATASETS_DIR"

    # Rename to cfp-fp
    if [ -d "$DATASETS_DIR/CFP" ]; then
        mv "$DATASETS_DIR/CFP" "$CFP_DIR"
        log_info "CFP-FP dataset extracted successfully"
    else
        log_error "Failed to extract CFP-FP dataset"
        return 1
    fi

    # Cleanup
    rm -f "$CFP_FILE"

    log_info "CFP-FP dataset downloaded and validated"
}

# Download AgeDB-30 dataset
download_agedb() {
    log_info "Downloading AgeDB-30 dataset..."

    # AgeDB-30 is part of AgeDB dataset
    AGEDB_URL="https://ibug.doc.ic.ac.uk/media/upload/files/AgeDB.zip"
    AGEDB_FILE="$TEMP_DIR/AgeDB.zip"
    AGEDB_DIR="$DATASETS_DIR/agedb-30"

    if [ -d "$AGEDB_DIR" ]; then
        log_warn "AgeDB-30 dataset already exists, skipping download"
        return 0
    fi

    # Download
    if command -v curl &> /dev/null; then
        curl -L -o "$AGEDB_FILE" "$AGEDB_URL"
    elif command -v wget &> /dev/null; then
        wget -O "$AGEDB_FILE" "$AGEDB_URL"
    else
        log_error "Neither curl nor wget found. Please install one of them."
        return 1
    fi

    # Extract
    log_info "Extracting AgeDB dataset..."
    unzip -q "$AGEDB_FILE" -d "$DATASETS_DIR"

    # Rename to agedb-30
    if [ -d "$DATASETS_DIR/AgeDB" ]; then
        mv "$DATASETS_DIR/AgeDB" "$AGEDB_DIR"
        log_info "AgeDB-30 dataset extracted successfully"
    else
        log_error "Failed to extract AgeDB dataset"
        return 1
    fi

    # Cleanup
    rm -f "$AGEDB_FILE"

    log_info "AgeDB-30 dataset downloaded and validated"
}

# Main execution
main() {
    log_info "Starting dataset download process..."
    log_info "This will download approximately 2GB of data"

    # Download all datasets
    download_lfw
    download_cfp_fp
    download_agedb

    # Cleanup temp directory
    rm -rf "$TEMP_DIR"

    log_info "All datasets downloaded successfully!"
    log_info "Dataset locations:"
    log_info "  - LFW: $DATASETS_DIR/lfw"
    log_info "  - CFP-FP: $DATASETS_DIR/cfp-fp"
    log_info "  - AgeDB-30: $DATASETS_DIR/agedb-30"
}

# Run main function
main "$@"
