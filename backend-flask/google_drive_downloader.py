"""
Google Drive Downloader for ML Models
Downloads model files from Google Drive using direct download links
"""

import requests
import os
from pathlib import Path


def download_from_google_drive(file_id, destination):
    """
    Download a file from Google Drive using file ID.
    
    Args:
        file_id: Google Drive file ID
        destination: Local file path to save the downloaded file
    
    Returns:
        bool: True if download successful, False otherwise
    """
    try:
        # Google Drive direct download URL
        URL = f"https://drive.google.com/uc?export=download&id={file_id}"
        
        print(f"Downloading from Google Drive: {file_id}")
        print(f"Destination: {destination}")
        
        session = requests.Session()
        
        response = session.get(URL, stream=True)
        token = get_confirm_token(response)
        
        if token:
            params = { 'confirm': token }
            response = session.get(URL, params=params, stream=True)
        
        save_response_content(response, destination)
        
        print(f"Download completed: {destination}")
        return True
        
    except Exception as e:
        print(f"Error downloading file from Google Drive: {e}")
        return False


def download_from_url(download_link, destination):
    """
    Download a file from a direct download URL.
    
    Args:
        download_link: Direct download URL
        destination: Local file path to save the downloaded file
    
    Returns:
        bool: True if download successful, False otherwise
    """
    try:
        print(f"Downloading from URL: {download_link}")
        print(f"Destination: {destination}")
        
        response = requests.get(download_link, stream=True, timeout=120)
        response.raise_for_status()
        
        # Create parent directories if they don't exist
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        
        # Save file
        with open(destination, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        # Verify file was downloaded
        if os.path.exists(destination):
            file_size = os.path.getsize(destination)
            print(f"Download completed: {destination} ({file_size} bytes)")
            return True
        else:
            print(f"ERROR: File not found after download: {destination}")
            return False
        
    except Exception as e:
        print(f"Error downloading file from URL: {e}")
        return False


def get_confirm_token(response):
    """
    Extract confirmation token from Google Drive response.
    """
    for key, value in response.cookies.items():
        if key.startswith('download_warning'):
            return value
    return None


def save_response_content(response, destination):
    """
    Save response content to file with progress tracking.
    """
    CHUNK_SIZE = 32768
    
    # Create parent directories if they don't exist
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    
    with open(destination, "wb") as f:
        for chunk in response.iter_content(CHUNK_SIZE):
            if chunk:
                f.write(chunk)


def sync_model_from_google_drive(file_id, file_name, download_link=None):
    """
    Sync a model file from Google Drive to local model directory.
    
    Args:
        file_id: Google Drive file ID
        file_name: Target filename (e.g., "cobia__custom_model_model.pkl")
        download_link: Optional direct download link
    
    Returns:
        tuple: (success: bool, local_path: str, message: str)
    """
    try:
        # Parse filename to determine subdirectory
        # Format: {species}__{model_name}_model.pkl
        parts = file_name.split('__')
        if len(parts) >= 2:
            species = parts[0]  # e.g., "cobia"
            model_file = '__'.join(parts[1:])  # e.g., "custom_model_model.pkl"
        else:
            species = "general"
            model_file = file_name
        
        # Construct destination path
        model_dir = os.path.join('model', species)
        os.makedirs(model_dir, exist_ok=True)
        
        destination = os.path.join(model_dir, model_file)
        
        # Try download using direct link first, fallback to file ID
        success = False
        if download_link:
            success = download_from_url(download_link, destination)
        
        if not success and file_id:
            success = download_from_google_drive(file_id, destination)
        
        if success and os.path.exists(destination):
            return True, destination, f"Model synced successfully: {destination}"
        else:
            return False, None, "Failed to download model from Google Drive"
            
    except Exception as e:
        error_msg = f"Error syncing model from Google Drive: {e}"
        print(error_msg)
        return False, None, error_msg


if __name__ == "__main__":
    # Test download
    import sys
    if len(sys.argv) < 3:
        print("Usage: python google_drive_downloader.py <file_id> <destination>")
        sys.exit(1)
    
    file_id = sys.argv[1]
    destination = sys.argv[2]
    
    success = download_from_google_drive(file_id, destination)
    if success:
        print("Test download successful!")
    else:
        print("Test download failed!")
        sys.exit(1)


