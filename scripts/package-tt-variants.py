"""Package TT Client jars for NeoForge 26.x (full) and 1.21.x (lite)."""
import zipfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLED = ROOT / "resources" / "bundled"
OUT = BUNDLED / "variants" / "neoforge"
SRC = BUNDLED / "ttclient.jar"

FULL_VARIANTS = {
    "26.2": ("[26.2.0.64,)", "[26.2]", "TT Client full for NeoForge 26.2"),
    "26.1": ("[26.1.0,)", "[26.1,26.2)", "TT Client for NeoForge 26.1"),
    "26.0": ("[26.0.0,)", "[26.0,26.1)", "TT Client for NeoForge 26.0"),
}

LITE_MCS = [
    "1.21.1", "1.21.2", "1.21.3", "1.21.4", "1.21.5",
    "1.21.6", "1.21.7", "1.21.8", "1.21.9", "1.21.10", "1.21.11",
]


def toml(label, neo, mc, desc, version="1.32.0"):
    return (
        'license="MIT"\n\n'
        '[[mods]]\n'
        'modId="ttclient"\n'
        f'version="{version}-{label}"\n'
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


def download(url: str, dest: Path) -> bool:
    try:
        print("GET", url)
        urllib.request.urlretrieve(url, dest)
        return dest.exists() and dest.stat().st_size > 1000
    except Exception as e:
        print("fail", url, e)
        return False


def ensure_full_src():
    if SRC.exists() and SRC.stat().st_size > 10000:
        return True
    url = "https://github.com/ben757119-cmyk/TT-Client/releases/download/v1.32.0/ttclient-1.32.0.jar"
    SRC.parent.mkdir(parents=True, exist_ok=True)
    return download(url, SRC)


def package_full():
    if not ensure_full_src():
        print("No full TT Client jar")
        return
    for label, (neo, mc, desc) in FULL_VARIANTS.items():
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
                # drop mixins ref if we want safer 26.0 — keep for full
                zout.writestr(info, data)
        print("full", dest, dest.stat().st_size)


def package_lite():
    """Pull lite 1.21 jars from latest TT-Client lite release if present."""
    # Try known tag patterns then latest release assets
    candidates = []
    # Prefer explicit lite release asset names
    for tag in ["lite-1.21-1", "lite-1.21-2", "lite-1.21-3", "v2.0.0-lite"]:
        for mc in LITE_MCS:
            candidates.append(
                (
                    mc,
                    f"https://github.com/ben757119-cmyk/TT-Client/releases/download/{tag}/ttclient-neoforge-{mc}.jar",
                )
            )
    # Also try 1.21.1 only from any lite tag
    for tag in ["lite-1.21-1", "lite-1.21-2"]:
        candidates.append(
            (
                "1.21.1",
                f"https://github.com/ben757119-cmyk/TT-Client/releases/download/{tag}/ttclient-neoforge-1.21.1.jar",
            )
        )

    got = {}
    for mc, url in candidates:
        if mc in got:
            continue
        dest_dir = OUT / mc
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / "ttclient.jar"
        if download(url, dest):
            got[mc] = dest
            print("lite", dest, dest.stat().st_size)

    # If we only got 1.21.1, copy to other 1.21.x slots (same NeoForge 21.1-line lite)
    if "1.21.1" in got:
        src = got["1.21.1"]
        for mc in LITE_MCS:
            if mc in got:
                continue
            dest_dir = OUT / mc
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / "ttclient.jar"
            dest.write_bytes(src.read_bytes())
            got[mc] = dest
            print("lite-copy", dest)

    if not got:
        print("No lite 1.21 jars available yet (CI still building)")


def write_manifest():
    builds = []
    for label in FULL_VARIANTS:
        builds.append(
            {
                "loader": "neoforge",
                "minecraft": label,
                "jar": f"variants/neoforge/{label}/ttclient.jar",
                "status": "supported" if label == "26.2" else "experimental",
            }
        )
    for mc in LITE_MCS:
        p = OUT / mc / "ttclient.jar"
        if p.exists():
            builds.append(
                {
                    "loader": "neoforge",
                    "minecraft": mc,
                    "jar": f"variants/neoforge/{mc}/ttclient.jar",
                    "status": "experimental",
                    "note": "TT Client Lite for NeoForge 1.21.x",
                }
            )
    import json

    man = {
        "ttClientVersion": "1.32.0+lite",
        "resourcePack": "TT-Client-ResourcePack.zip",
        "builds": builds,
    }
    (BUNDLED / "manifest.json").write_text(json.dumps(man, indent=2) + "\n")
    print("manifest builds", len(builds))


def main():
    BUNDLED.mkdir(parents=True, exist_ok=True)
    package_full()
    package_lite()
    write_manifest()


if __name__ == "__main__":
    main()
