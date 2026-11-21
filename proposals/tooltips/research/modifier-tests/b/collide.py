import warnings

import pandas as pd
import polars as pl

warnings.simplefilter("always")


@pd.api.extensions.register_dataframe_accessor("plot")  # collides with built-in
class A:
    def __init__(self, df):
        self.df = df


@pd.api.extensions.register_dataframe_accessor("tt")
class B1:
    def __init__(self, df):
        self.df = df


@pd.api.extensions.register_dataframe_accessor("tt")  # second plugin, same name
class B2:
    def __init__(self, df):
        self.df = df


@pl.api.register_dataframe_namespace("tt")
class C1:
    def __init__(self, df):
        self.df = df


@pl.api.register_dataframe_namespace("tt")
class C2:
    def __init__(self, df):
        self.df = df


@pl.api.register_dataframe_namespace("columns")  # built-in attribute
class C3:
    def __init__(self, df):
        self.df = df


print("pandas df.tt is", type(pd.DataFrame().tt).__name__)
print("polars df.tt is", type(pl.DataFrame().tt).__name__)
