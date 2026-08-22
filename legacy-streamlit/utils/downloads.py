"""Download helpers using Streamlit's built-in download_button."""


def create_download_button(label: str, data: str, filename: str, mime: str = "text/plain"):
    """
    Create a Streamlit download button.

    Parameters
    ----------
    label    : button text
    data     : file content (string)
    filename : download filename
    mime     : MIME type

    Usage:
        import streamlit as st
        from utils.downloads import create_download_button
        create_download_button("Download XML", xml_string, "config.rou.xml", "text/xml")
    """
    import streamlit as st

    st.download_button(
        label=label,
        data=data.encode("utf-8"),
        file_name=filename,
        mime=mime,
    )


def serve_file(content: str, filename: str, mime: str = "text/plain"):
    """Alias kept for backward compatibility."""
    create_download_button(f"Download {filename}", content, filename, mime)
