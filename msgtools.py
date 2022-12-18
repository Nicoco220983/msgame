#!/usr/bin/env python
import os
import argparse
import shutil
import http.server
import socketserver
import subprocess
from contextlib import contextmanager

HERE = os.path.dirname(__file__)


def main():
    argp = argparse.ArgumentParser(description='MsGame dev tools.')
    cmdp = argp.add_subparsers()

    argp_serve = cmdp.add_parser('resize_image', help="Resize an image file")
    argp_serve.add_argument('iopath', type=str, help="Input and output file")
    argp_serve.add_argument('size', type=str, help="Examples: 30:30, 30:-1")
    argp_serve.set_defaults(func=resize_image)

    argp_serve = cmdp.add_parser('build_spreadsheet', help="Concatenate a serie of images into a single image file")
    argp_serve.add_argument('opath', type=str, help="Ouput file")
    argp_serve.add_argument('ipaths', type=str, nargs='+', help="Input files")
    argp_serve.set_defaults(func=build_spreadsheet)

    argp_serve = cmdp.add_parser('compress_audio', help="Compress an audio file by reducing its bitrate")
    argp_serve.add_argument('ipath', type=str, help="Input file")
    argp_serve.add_argument('--opath', type=str, help="Output file. If not defined, the input file path is overwriten.")
    argp_serve.add_argument('--bitrate', type=str, default="64k", help="Audio bitrate (Example: 64k)")
    argp_serve.add_argument('--nb_channels', type=int, default="1", help="1 for mono, 2 for stereo")
    argp_serve.set_defaults(func=compress_audio)

    argp_serve = cmdp.add_parser('trim_audio', help="Cut audio file, by removing beginning or end.")
    argp_serve.add_argument('ipath', type=str, help="Input file")
    argp_serve.add_argument('start', type=str, help="Example: 00:00:00.0")
    argp_serve.add_argument('end', type=str, help="Example: 00:00:10.0")
    argp_serve.add_argument('--opath', type=str, help="Output file. If not defined, the input file path is overwriten.")
    argp_serve.set_defaults(func=trim_audio)

    argp_serve = cmdp.add_parser('only_audio', help="Remove all non-audio streams from a file.")
    argp_serve.add_argument('ipath', type=str, help="Input file")
    argp_serve.add_argument('--opath', type=str, help="Output file. If not defined, the input file path is overwriten.")
    argp_serve.set_defaults(func=only_audio)

    argp_serve = cmdp.add_parser('serve')
    argp_serve.add_argument('--port', type=int, default=8080)
    argp_serve.set_defaults(func=serve)

    args = argp.parse_args()
    args.func(**vars(args))


def resize_image(iopath, size, **kwargs):
    with backup_and_copy_file(iopath) as copy_iopath:
        subprocess.run(["ffmpeg", "-y", "-i", copy_iopath, "-vf", f"scale={size}", iopath])
    

def build_spreadsheet(opath, ipaths, **kwargs):
    args = ["ffmpeg", "-y"]
    for ipath in ipaths:
        args += ["-i", ipath]
    args += ["-filter_complex"]
    # example: "[0][1][2][3]hstack=inputs=4"
    args += ["".join(f"[{i}]" for i in range(len(ipaths))) + f"hstack=inputs={len(ipaths)}"]
    args += [opath]
    subprocess.run(args)


def compress_audio(ipath, opath, bitrate, nb_channels, **kwargs):
    backup_file_if_needed(ipath)
    with copy_ifile_if_needed(ipath, opath=opath) as (_ipath, _opath):
        subprocess.run(["ffmpeg", "-y", "-i", _ipath, "-b:a", bitrate, "-ac", str(nb_channels), _opath])
    

def trim_audio(ipath, start, end, opath, **kwargs):
    backup_file_if_needed(ipath)
    with copy_ifile_if_needed(ipath, opath=opath) as (_ipath, _opath):
        subprocess.run(["ffmpeg", "-y", "-i", _ipath, "-ss", start, "-t", end, _opath])


def only_audio(ipath, opath, **kwargs):
    backup_file_if_needed(ipath)
    with copy_ifile_if_needed(ipath, opath=opath) as (_ipath, _opath):
        subprocess.run(["ffmpeg", "-y", "-i", _ipath, "-map", "0:a", "-c", "copy", _opath])


class HttpHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)


def serve(port, **kwargs):
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", port), HttpHandler) as httpd:
        print(f"serving at port: {port}")
        httpd.serve_forever()


def backup_file_if_needed(fpath):
    backup_fpath = f"{fpath}.backup"
    if not os.path.exists(backup_fpath):
        shutil.copyfile(fpath, backup_fpath)


@contextmanager
def copy_ifile_if_needed(ipath, opath=None):
    if opath and ipath != opath:
        yield ipath, opath
    else:
        copy_fpath = f"{ipath}.copy"
        shutil.copyfile(ipath, copy_fpath)
        yield copy_fpath, ipath
        os.remove(copy_fpath)



if __name__ == "__main__":
    main()