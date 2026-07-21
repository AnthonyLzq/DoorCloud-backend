#!/bin/bash

# Setup face recognition benchmark datasets
# Uses existing files in datasets/temp/ or downloads if needed

set -e  # Exit on error

DATASETS_DIR="datasets"
TEMP_DIR="$DATASETS_DIR/temp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Setup LFW dataset
setup_lfw() {
    log_step "Setting up LFW dataset..."
    
    LFW_DIR="$DATASETS_DIR/lfw"
    
    if [ -d "$LFW_DIR" ] && [ -f "$LFW_DIR/pairs.txt" ]; then
        log_info "LFW dataset already exists, skipping setup"
        return 0
    fi
    
    # Check if we have the files in temp
    if [ -f "$TEMP_DIR/lfw.tgz" ]; then
        log_info "Found lfw.tgz in temp directory"
        
        # Create directory
        mkdir -p "$LFW_DIR"
        
        # Extract
        log_info "Extracting LFW dataset..."
        tar -xzf "$TEMP_DIR/lfw.tgz" -C "$DATASETS_DIR"
        
        # Copy pairs.txt if it exists in temp
        if [ -f "$TEMP_DIR/pairs.txt" ]; then
            cp "$TEMP_DIR/pairs.txt" "$LFW_DIR/"
            log_info "Copied pairs.txt to LFW directory"
        fi
        
        log_info "LFW dataset setup successfully"
    else
        log_warn "LFW dataset not found in temp directory"
        log_warn "To download LFW manually:"
        echo "  1. Visit: http://vis-www.cs.umass.edu/lfw/"
        echo "  2. Download lfw.tgz and pairs.txt"
        echo "  3. Place them in $TEMP_DIR/"
        echo "  4. Run this script again"
        return 1
    fi
}

# Setup CFP-FP dataset
setup_cfp_fp() {
    log_step "Setting up CFP-FP dataset..."
    
    CFP_DIR="$DATASETS_DIR/cfp-fp"
    
    if [ -d "$CFP_DIR" ]; then
        log_info "CFP-FP dataset already exists, skipping setup"
        return 0
    fi
    
    # Check if we have the file in temp
    if [ -f "$TEMP_DIR/cfp-dataset.zip" ]; then
        log_info "Found cfp-dataset.zip in temp directory"
        
        # Extract using python (unzip might not be available)
        log_info "Extracting CFP-FP dataset..."
        if command -v unzip &> /dev/null; then
            unzip -q "$TEMP_DIR/cfp-dataset.zip" -d "$DATASETS_DIR"
        else
            python3 -c "import zipfile; zipfile.ZipFile('$TEMP_DIR/cfp-dataset.zip').extractall('$DATASETS_DIR')"
        fi
        
        # Rename to cfp-fp (the extracted directory might have a different name)
        if [ -d "$DATASETS_DIR/CFP" ]; then
            mv "$DATASETS_DIR/CFP" "$CFP_DIR"
            log_info "CFP-FP dataset setup successfully"
        elif [ -d "$DATASETS_DIR/cfp-dataset" ]; then
            mv "$DATASETS_DIR/cfp-dataset" "$CFP_DIR"
            log_info "CFP-FP dataset setup successfully"
        elif [ -d "$DATASETS_DIR/cfp-fp" ]; then
            log_info "CFP-FP dataset setup successfully"
        else
            log_error "Unexpected directory structure after extraction"
            log_error "Please check the extracted contents manually"
            return 1
        fi
    else
        log_warn "CFP-FP dataset not found in temp directory"
        log_warn "To download CFP-FP manually:"
        echo "  1. Visit: http://www.cfpw.io/"
        echo "  2. Download the dataset"
        echo "  3. Place cfp-dataset.zip in $TEMP_DIR/"
        echo "  4. Run this script again"
        return 1
    fi
}

# Setup AgeDB-30 dataset
setup_agedb() {
    log_step "Setting up AgeDB-30 dataset..."
    
    AGEDB_DIR="$DATASETS_DIR/agedb-30"
    
    if [ -d "$AGEDB_DIR" ]; then
        log_info "AgeDB-30 dataset already exists, skipping setup"
        return 0
    fi
    
    # Check if we have the file in temp
    if [ -f "$TEMP_DIR/AgeDB.zip" ]; then
        log_info "Found AgeDB.zip in temp directory"
        
        # Extract using python (unzip might not be available)
        log_info "Extracting AgeDB dataset..."
        if command -v unzip &> /dev/null; then
            unzip -q "$TEMP_DIR/AgeDB.zip" -d "$DATASETS_DIR"
        else
            python3 -c "import zipfile; zipfile.ZipFile('$TEMP_DIR/AgeDB.zip').extractall('$DATASETS_DIR')"
        fi
        
        # Rename to agedb-30
        if [ -d "$DATASETS_DIR/AgeDB" ]; then
            mv "$DATASETS_DIR/AgeDB" "$AGEDB_DIR"
            log_info "AgeDB-30 dataset setup successfully"
        elif [ -d "$DATASETS_DIR/agedb-30" ]; then
            log_info "AgeDB-30 dataset setup successfully"
        else
            log_error "Unexpected directory structure after extraction"
            log_error "Please check the extracted contents manually"
            return 1
        fi
    else
        log_warn "AgeDB-30 dataset not found in temp directory"
        log_warn "AgeDB-30 requires manual download:"
        echo "  1. Visit: https://ibug.doc.ic.ac.uk/resources/agedb/"
        echo "  2. Email: s.moschoglou@imperial.ac.uk for the zip password"
        echo "  3. Download AgeDB.zip"
        echo "  4. Place it in $TEMP_DIR/"
        echo "  5. Run this script again"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting dataset setup process..."
    
    # Create directories
    mkdir -p "$DATASETS_DIR"
    mkdir -p "$TEMP_DIR"
    
    # Track success
    SUCCESS_COUNT=0
    TOTAL_COUNT=3
    
    # Setup datasets
    if setup_lfw; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    fi
    
    if setup_cfp_fp; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    fi
    
    if setup_agedb; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    fi
    
    # Summary
    echo ""
    log_info "Dataset setup complete!"
    log_info "Successfully set up: $SUCCESS_COUNT/$TOTAL_COUNT datasets"
    
    if [ $SUCCESS_COUNT -lt $TOTAL_COUNT ]; then
        echo ""
        log_warn "Some datasets were not set up. Please download them manually."
        log_warn "Check the instructions above for each missing dataset."
    fi
    
    # Show dataset locations
    echo ""
    log_info "Dataset locations:"
    [ -d "$DATASETS_DIR/lfw" ] && log_info "  ✓ LFW: $DATASETS_DIR/lfw"
    [ -d "$DATASETS_DIR/cfp-fp" ] && log_info "  ✓ CFP-FP: $DATASETS_DIR/cfp-fp"
    [ -d "$DATASETS_DIR/agedb-30" ] && log_info "  ✓ AgeDB-30: $DATASETS_DIR/agedb-30"
}

# Run main function
main "$@"
