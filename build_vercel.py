"""Build the Vite frontend before Vercel collects Django static files."""
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / 'frontend'


def main():
    if not shutil.which('npm'):
        raise SystemExit('Node.js/npm is required in the Vercel build environment.')
    subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=FRONTEND, check=True)
    subprocess.run(['npm', 'run', 'build'], cwd=FRONTEND, check=True)


if __name__ == '__main__':
    main()
