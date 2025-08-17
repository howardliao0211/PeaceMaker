#!/usr/bin/env python3
"""
PeaceMaker Startup Script
Launches the web UI and shows backend integration options
"""

import os
import sys
import subprocess
import time
from pathlib import Path

def print_banner():
    """Print PeaceMaker banner"""
    print("""
    ╔══════════════════════════════════════════════════════════════╗
    ║                    🕊️  PeaceMaker 🕊️                        ║
    ║              Real-time Communication with AI                 ║
    ╚══════════════════════════════════════════════════════════════╝
    """)

def check_dependencies():
    """Check if required dependencies are installed"""
    required_packages = ['fastapi', 'uvicorn', 'fastrtc']
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print(f"❌ Missing required packages: {', '.join(missing_packages)}")
        print("Please install them using:")
        print(f"pip install {' '.join(missing_packages)}")
        return False
    
    print("✅ All required packages are installed")
    return True

def start_web_server():
    """Start the web server"""
    print("\n🚀 Starting PeaceMaker Web Server...")
    
    # Check if UI files exist
    ui_path = Path(__file__).parent / "ui"
    if not ui_path.exists():
        print("❌ UI directory not found. Please ensure the 'ui' folder exists.")
        return None
    
    # Start web server
    try:
        process = subprocess.Popen([
            sys.executable, "web_server.py"
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Wait a moment for server to start
        time.sleep(3)
        
        if process.poll() is None:
            print("✅ Web server started successfully!")
            print("🌐 Open your browser and go to: http://localhost:8000")
            return process
        else:
            print("❌ Failed to start web server")
            return None
            
    except Exception as e:
        print(f"❌ Error starting web server: {e}")
        return None

def show_integration_options():
    """Show backend integration options"""
    print("\n🔧 Backend Integration Options:")
    print("1. Use Web UI only (current setup)")
    print("2. Integrate with existing backend (requires modification)")
    print("3. Run backend integration test")
    
    choice = input("\nChoose an option (1-3) or press Enter to continue with web UI: ").strip()
    
    if choice == "2":
        print("\n📚 To integrate with your existing backend:")
        print("1. Modify 'integrate_backend.py' to match your STT output format")
        print("2. Update 'web_server.py' to use the integration class")
        print("3. Modify the frontend JavaScript to send real audio data")
        print("\nSee the integration files for detailed examples.")
        
    elif choice == "3":
        print("\n🧪 Running backend integration test...")
        try:
            result = subprocess.run([
                sys.executable, "integrate_backend.py"
            ], capture_output=True, text=True)
            print(result.stdout)
            if result.stderr:
                print("Errors:", result.stderr)
        except Exception as e:
            print(f"❌ Error running integration test: {e}")

def show_designer_info():
    """Show information for designers"""
    print("\n🎨 For Designers:")
    print("📁 UI files are in the 'ui/' directory:")
    print("   • index.html - Structure and content")
    print("   • styles.css - All styling (modify here!)")
    print("   • app.js - Functionality (don't modify unless needed)")
    print("\n🔧 Easy customization:")
    print("   • Change colors in CSS variables (top of styles.css)")
    print("   • Modify spacing, fonts, and themes")
    print("   • Add custom animations and effects")
    print("\n📖 See 'ui/README.md' for detailed designer guide")

def main():
    """Main startup function"""
    print_banner()
    
    # Check dependencies
    if not check_dependencies():
        return
    
    # Show designer info
    show_designer_info()
    
    # Start web server
    server_process = start_web_server()
    
    if server_process:
        # Show integration options
        show_integration_options()
        
        print("\n🎉 PeaceMaker is running!")
        print("💡 Tips:")
        print("   • Press Ctrl+C to stop the server")
        print("   • Modify UI files and refresh browser to see changes")
        print("   • Check browser console for any errors")
        print("   • Use browser dev tools to inspect and modify CSS")
        
        try:
            # Keep the script running
            server_process.wait()
        except KeyboardInterrupt:
            print("\n🛑 Stopping PeaceMaker...")
            server_process.terminate()
            print("✅ PeaceMaker stopped")
    
    else:
        print("\n❌ Failed to start PeaceMaker. Please check the errors above.")

if __name__ == "__main__":
    main()
