from .server import serve


def main():
    """MCP Time Server - Time and timezone conversion functionality for MCP"""
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="give a model the ability to handle time queries and timezone conversions"
    )
    parser.add_argument("--local-timezone", type=str, help="Override local timezone")
    
    parser.add_argument("--mode", type=str, help="Server run mode", default="stdio")
    parser.add_argument("--port", type=int, help="Server port", default=9593)
    parser.add_argument("--endpoint", type=str, help="Server endpoint", default="/rest")

    args = parser.parse_args()
    asyncio.run(serve(args.local_timezone, args.mode, args.port, args.endpoint))


if __name__ == "__main__":
    main()
