# -*- coding: utf-8 -*-
"""由 site/tracks_street*.json 生成 nebula/catalogue.js（星表快照）。

新增/修改了原始轨迹数据后，在本目录执行：
    python nebula/build_catalogue.py
原始数据位于 site/，本脚本只读不写。
"""
import io, json, os, re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(HERE, "site")
OUT = os.path.join(HERE, "nebula", "catalogue.js")

# 场景元信息取自 site/tracker.js 的 SCENES 与 site/index.html 的场景导航
SCENE_META = [
    ("street1", "tracks_street01.json", "street_01.mp4",
     "CAM 01 / STREET 01", "ZONE A · 科韵路站 K0+780 交叉口", "站前交叉口", 25),
    ("street2", "tracks_street02.json", "street_02.mp4",
     "CAM 02 / STREET 02", "ZONE B · 科韵路 K0+000 夜间主路", "夜间主路 · 车流", 25),
    ("street3", "tracks_street03.json", "street_03.mp4",
     "CAM 03 / STREET 03", "ZONE C · 科韵路南段慢行道", "南段慢行道", 25),
    ("street4", "tracks_street04.json", "street_04.mp4",
     "CAM 04 / STREET 04", "ZONE D · 科韵路辅道停靠带", "辅道停靠带", 25),
]

CAT_LABEL = {
    "vehicle": "车流主体",
    "person": "骑手 / 行人",
    "industrial": "工业物",
    "infrastructure": "基底设施",
}


def num(text):
    """从 '12,400 kWh' / '-0.029 t CO₂e' 中取第一个数值"""
    if text is None:
        return 0.0
    m = re.search(r"-?[0-9][0-9,\.]*", str(text))
    if not m:
        return 0.0
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return 0.0


def lerp_center(kfs, t):
    """复刻 tracker.js 的插值，取时刻 t 的目标中心点"""
    if t <= kfs[0]["t"]:
        a = kfs[0]
    elif t >= kfs[-1]["t"]:
        a = kfs[-1]
    else:
        a = kfs[0]
        for i in range(len(kfs) - 1):
            p, n = kfs[i], kfs[i + 1]
            if p["t"] <= t <= n["t"]:
                r = (t - p["t"]) / ((n["t"] - p["t"]) or 1e-6)
                return (
                    p["x"] + (n["x"] - p["x"]) * r + (p["w"] + (n["w"] - p["w"]) * r) / 2,
                    p["y"] + (n["y"] - p["y"]) * r + (p["h"] + (n["h"] - p["h"]) * r) / 2,
                )
    return a["x"] + a["w"] / 2, a["y"] + a["h"] / 2


def main():
    scenes, stars = [], []
    for key, tf, video, cam, zone, alias, fps in SCENE_META:
        path = os.path.join(SITE, tf)
        with io.open(path, encoding="utf-8") as f:
            d = json.load(f)
        dur = float(d.get("duration") or 0) or 1.0
        scenes.append({
            "key": key, "tracks": tf, "video": video, "cam": cam,
            "zone": zone, "alias": alias, "duration": round(dur, 2),
            "fps": fps, "note": d.get("note", ""), "count": len(d["objects"]),
        })

        for o in d["objects"]:
            kfs = o["keyframes"]
            appear, disappear = float(o["appear"]), float(o["disappear"])
            mid = lerp_center(kfs, (appear + disappear) / 2)
            traj = [[round(k["x"] + k["w"] / 2, 4), round(k["y"] + k["h"] / 2, 4)] for k in kfs]
            disp = sum(
                ((traj[i + 1][0] - traj[i][0]) ** 2 + (traj[i + 1][1] - traj[i][1]) ** 2) ** 0.5
                for i in range(len(traj) - 1)
            )
            area0 = kfs[0]["w"] * kfs[0]["h"]
            stars.append({
                "objectId": o["objectId"],
                "scene": key,
                "label": o["label"],
                "labelEn": o["labelEn"],
                "category": o["category"],
                "categoryLabel": CAT_LABEL.get(o["category"], o["category"]),
                "function": o.get("function", ""),
                "model": o.get("model", "UNVERIFIED"),
                "conf": o["conf"],
                "appear": appear, "disappear": disappear,
                "t0": round(appear / dur, 4), "t1": round(disappear / dur, 4),
                "energyKwh": o.get("energyKwh", 0),
                "waterT": num(o.get("info", {}).get("制造用水")),
                "steelKg": num(o.get("info", {}).get("用钢量")),
                "lifeYear": num(o.get("info", {}).get("设计寿命")),
                "carbonT": num(o.get("info", {}).get("年运营碳排放")),
                "info": o.get("info", {}),
                "cx": round(mid[0], 4), "cy": round(mid[1], 4),
                "area": round(area0, 5),
                "disp": round(disp, 4),
                "moving": disp > 0.02,
                "traj": traj,
                "thumb": "site/thumbs/%s.jpg" % o["objectId"],
            })

    payload = {
        "project": "SECOND POPULATION SURVEY",
        "generatedFrom": "site/tracks_street0*.json",
        "scenes": scenes,
        "objects": stars,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with io.open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 自动生成的星表快照 —— 源数据 site/tracks_street0*.json\n")
        f.write("   重新生成： python nebula/build_catalogue.py */\n")
        f.write("window.CATALOGUE = %s;\n" % body)

    print("catalogue.js  ←  scenes %d, stars %d" % (len(scenes), len(stars)))
    for s in scenes:
        print("   %-8s %-34s %2d objects  %.1fs" % (s["key"], s["zone"], s["count"], s["duration"]))


if __name__ == "__main__":
    main()
