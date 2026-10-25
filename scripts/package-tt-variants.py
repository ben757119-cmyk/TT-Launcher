"""Repackage TT Client jar with per-version NeoForge/Minecraft dependency ranges."""
import zipfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLED = ROOT / "resources" / "bundled"
OUT = BUNDLED / "variants" / "neoforge"
SRC = BUNDLED / "ttclient.jar"

VARIANTS = {
    "26.2": ("[26.2.0.64,)", "[26.2]", "TT Client full for NeoForge 26.2"),
    "26.1": ("[26.1.0,)", "[26.1,26.2)", "TT Client for NeoForge 26.1"),
    "26.0": ("[26.0.0,)", "[26.0,26.1)", "TT Client for NeoForge 26.0"),
}


def toml(label, neo, mc, desc):
    return (
        'license="MIT"\n\n'
        '[[mods]]\n'
        'modId="ttclient"\n'
        f'version="1.32.0-{label}"\n'
        'displayName="TT Client"\n'
        'authors="The_Algorithm67"\n'
        'description="""\n'
        f'{desc}\n'
        '"""\n\n'
        '[[dependencies.ttclient]]\n'
        '    modId="neoforge"\n'
        '    type="required"\n'
        f'    versionRange="{neo}"\n'
        '    ordering="NONE"\n'
        '    side="CLIENT"\n\n'
        '[[dependencies.ttclient]]\n'
        '    modId="minecraft"\n'
        '    type="required"\n'
        f'    versionRange="{mc}"\n'
        '    ordering="NONE"\n'
        '    side="CLIENT"\n\n'
        '[[mixins]]\n'
        'config="ttclient.mixins.json"\n'
    )


def ensure_src():
    if SRC.exists() and SRC.stat().st_size > 10000:
        return
    url = "https://github.com/ben757119-cmyk/TT-Client/releases/download/v1.32.0/ttclient-1.32.0.jar"
    print("Downloading", url)
    SRC.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, SRC)


def main():
    ensure_src()
    for label, (neo, mc, desc) in VARIANTS.items():
        dest_dir = OUT / label
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / "ttclient.jar"
        body = toml(label, neo, mc, desc).encode("utf-8")
        with zipfile.ZipFile(SRC, "r") as zin, zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                name = info.filename.replace("\\", "/")
                if name.endswith("META-INF/neoforge.mods.toml"):
                    data = body
                zout.writestr(info, data)
        print("wrote", dest, dest.stat().st_size)


if __name__ == "__main__":
    main()
