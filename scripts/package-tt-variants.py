"""Package TT Client jars: full 26.x + lite 1.21.1–1.21.11."""
import json
import zipfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLED = ROOT / "resources" / "bundled"
OUT = BUNDLED / "variants" / "neoforge"
SRC = BUNDLED / "ttclient.jar"
LITE_TAG = "lite-1.21-1"

FULL = {
    "26.2": ("[26.2.0.64,)", "[26.2]", "TT Client full for NeoForge 26.2"),
    "26.1": ("[26.1.0,)", "[26.1,26.2)", "TT Client for NeoForge 26.1"),
    "26.0": ("[26.0.0,)", "[26.0,26.1)", "TT Client for NeoForge 26.0"),
}

LITE_MCS = [
    "1.21.1", "1.21.2", "1.21.3", "1.21.4", "1.21.5",
    "1.21.6", "1.21.7", "1.21.8", "1.21.9", "1.21.10", "1.21.11",
]


def download(url: str, dest: Path) -> bool:
    try:
        print("GET", url)
        dest.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, dest)
        ok = dest.exists() and dest.stat().st_size > 1000
        print("  ->", dest.stat().st_size if ok else "FAIL")
        return ok
    except Exception as e:
        print("  fail:", e)
        return False


def make_toml(label, neo, mc, desc, version="1.32.0"):
    return (
        f'license="MIT"\n\n'
        f'[[mods]]\n'
        f'modId="ttclient"\n'
        f'version="{version}-{label}"\n'
        f'displayName="TT Client"\n'
        f'authors="The_Algorithm67"\n'
        f'description="""\n{desc}\n"""\n\n'
        f'[[dependencies.ttclient]]\n'
        f'    modId="neoforge"\n'
        f'    type="required"\n'
        f'    versionRange="{neo}"\n'
        f'    ordering="NONE"\n'
        f'    side="CLIENT"\n\n'
        f'[[dependencies.ttclient]]\n'
        f'    modId="minecraft"\n'
        f'    type="required"\n'
        f'    versionRange="{mc}"\n'
        f'    ordering="NONE"\n'
        f'    side="CLIENT"\n\n'
        f'[[mixins]]\n'
        f'config="ttclient.mixins.json"\n'
    )


def package_full():
    if not SRC.exists() or SRC.stat().st_size < 10000:
        download(
            "https://github.com/ben757119-cmyk/TT-Client/releases/download/v1.32.0/ttclient-1.32.0.jar",
            SRC,
        )
    if not SRC.exists():
        print("No full jar")
        return
    for label, (neo, mc, desc) in FULL.items():
        dest = OUT / label / "ttclient.jar"
        dest.parent.mkdir(parents=True, exist_ok=True)
        body = make_toml(label, neo, mc, desc).encode("utf-8")
        with zipfile.ZipFile(SRC, "r") as zin, zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename.replace("\\", "/").endswith("META-INF/neoforge.mods.toml"):
                    data = body
                zout.writestr(info, data)
        print("full", dest, dest.stat().st_size)


def package_lite():
    for mc in LITE_MCS:
        url = f"https://github.com/ben757119-cmyk/TT-Client/releases/download/{LITE_TAG}/ttclient-neoforge-{mc}.jar"
        dest = OUT / mc / "ttclient.jar"
        if not download(url, dest):
            base = OUT / "1.21.1" / "ttclient.jar"
            if base.exists() and mc != "1.21.1":
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(base.read_bytes())
                print("lite-copy", dest)


def write_manifest():
    builds = []
    for label in FULL:
        if (OUT / label / "ttclient.jar").exists():
            builds.append({
                "loader": "neoforge",
                "minecraft": label,
                "jar": f"variants/neoforge/{label}/ttclient.jar",
                "status": "supported" if label == "26.2" else "experimental",
            })
    for mc in LITE_MCS:
        if (OUT / mc / "ttclient.jar").exists():
            builds.append({
                "loader": "neoforge",
                "minecraft": mc,
                "jar": f"variants/neoforge/{mc}/ttclient.jar",
                "status": "experimental",
                "note": "TT Client Lite for NeoForge 1.21.x",
            })
    man = {
        "ttClientVersion": "1.32.0+lite-1.21",
        "resourcePack": "TT-Client-ResourcePack.zip",
        "builds": builds,
    }
    BUNDLED.mkdir(parents=True, exist_ok=True)
    (BUNDLED / "manifest.json").write_text(json.dumps(man, indent=2) + "\n")
    print("manifest builds:", len(builds))
    for b in builds:
        print(" ", b["loader"], b["minecraft"], b["status"])


def main():
    BUNDLED.mkdir(parents=True, exist_ok=True)
    package_full()
    package_lite()
    write_manifest()


if __name__ == "__main__":
    main()
