import os
import pathlib

def combine_files(project_dir, output_file, ignore_dirs=None, ignore_extensions=None):
    """
    Combines all files in the project directory into a single file, with file paths as comments.
    
    Args:
        project_dir (str): Path to the project directory
        output_file (str): Path to the output file
        ignore_dirs (list): List of directory names to ignore (e.g., ['node_modules', '.git'])
        ignore_extensions (list): List of file extensions to ignore (e.g., ['.png', '.jpg'])
    """
    if ignore_dirs is None:
        ignore_dirs = ['node_modules', '.git', '__pycache__']
    if ignore_extensions is None:
        ignore_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bin', '.exe']
    
    project_path = pathlib.Path(project_dir)
    output_path = pathlib.Path(output_file)
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with output_path.open('w', encoding='utf-8') as outfile:
        for root, dirs, files in os.walk(project_path):
            # Skip ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                # Skip files with ignored extensions
                if pathlib.Path(file).suffix.lower() in ignore_extensions:
                    continue
                
                file_path = pathlib.Path(root) / file
                # Get relative path for comment
                relative_path = file_path.relative_to(project_path)
                
                try:
                    with file_path.open('r', encoding='utf-8') as infile:
                        content = infile.read()
                        # Write file path as comment and content
                        outfile.write(f"\n// {relative_path}\n\n")
                        outfile.write(content)
                        outfile.write("\n\n")
                except UnicodeDecodeError:
                    # Skip binary files or files with encoding issues
                    print(f"Skipping {file_path}: Cannot decode as UTF-8")
                except Exception as e:
                    print(f"Error reading {file_path}: {str(e)}")

if __name__ == "__main__":
    # Example usage
    project_directory = "src"  # Replace with your project path
    output_file = "combined_output.txt"         # Replace with desired output file path
    combine_files(project_directory, output_file)